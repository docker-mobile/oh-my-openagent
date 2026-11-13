import { InvalidArgumentError, type Command, type CommanderError } from "commander"
import pc from "picocolors"

// Structural types for the arsenal corpus. They are declared locally rather than
// imported from the package: the declarations build compiles only this package's
// src under a pinned rootDir, and a type-position import of another workspace
// package resolves to that package's .ts source and fails the build with TS6059.
interface OffensivePrimitive {
  readonly id: string
  readonly binary: string
  readonly name: string
  readonly actions: readonly string[]
  readonly platform: readonly string[]
  readonly mitre: readonly string[]
  readonly commands: readonly { readonly code: string; readonly usecase: string }[]
}

interface ArsenalIndex {
  readonly sources: Readonly<Record<string, number>>
  readonly generatedAt: string
  readonly upstreamPins: Readonly<Record<string, string>>
}

interface ArsenalRankState {
  readonly privilege: string
  readonly platform: string
  readonly tty: boolean
  readonly hasShell: boolean
}

// The generated corpus is megabytes; a static import would inline it into the
// bundle, whose budget is already exceeded, so it is loaded from disk instead.
// A `typeof import()` here would be a type-position import of another workspace
// package, which the declarations build resolves to that package's .ts source
// and rejects under its pinned rootDir, so the needed surface is declared.
interface ArsenalModule {
  readonly ARSENAL_SOURCES: readonly string[]
  readonly loadPrimitives: (
    dataRoot: string,
    source: string,
  ) => Promise<readonly OffensivePrimitive[]>
  readonly loadIndex: (dataRoot: string) => Promise<ArsenalIndex>
  readonly rankForState: (
    state: ArsenalRankState,
    primitives: readonly OffensivePrimitive[],
  ) => readonly OffensivePrimitive[]
  readonly searchPrimitives: (
    primitives: readonly OffensivePrimitive[],
    query: {
      readonly action?: string
      readonly platform?: string
      readonly binary?: string
      readonly text?: string
      readonly mitre?: string
      readonly source?: string
      readonly limit?: number
    },
  ) => readonly OffensivePrimitive[]
  readonly resolveDataRoot: (explicit?: string) => string
}

const DEFAULT_TERMINAL_WIDTH = 120
const MIN_COMMAND_WIDTH = 24
const MAX_ACTION_WIDTH = 32
const EDGE = "..."
const USAGE_EXIT_CODE = 2
const RUNTIME_EXIT_CODE = 1

const PRIVILEGES = ["user", "sudo", "root", "suid", "system"] as const
const PLATFORMS = ["linux", "macos", "unix", "windows"] as const
const OFFENSIVE_ACTIONS = [
  "execute",
  "shell",
  "reverse-shell",
  "bind-shell",
  "file-read",
  "file-write",
  "upload",
  "download",
  "privilege-escalation",
  "credential-access",
  "defense-evasion",
  "persistence",
  "lateral-movement",
  "uac-bypass",
  "injection",
  "recon",
] as const

type Privilege = (typeof PRIVILEGES)[number]
type Platform = (typeof PLATFORMS)[number]
type ActionName = (typeof OFFENSIVE_ACTIONS)[number]

interface IndexOptions {
  readonly json?: boolean
}

interface SearchOptions {
  readonly action?: string
  readonly platform?: string
  readonly source?: string
  readonly mitre?: string
  readonly limit?: number
  readonly json?: boolean
}

interface ForStateOptions {
  readonly privilege?: string
  readonly platform?: string
  readonly tty?: boolean
  readonly json?: boolean
}

interface TableRow {
  readonly id: string
  readonly actions: string
  readonly command: string
}

interface Corpus {
  readonly dataRoot: string
  readonly primitives: readonly OffensivePrimitive[]
}

const colorEnabled = process.stdout.isTTY === true

function bold(text: string): string {
  return colorEnabled ? pc.bold(text) : text
}

function dim(text: string): string {
  return colorEnabled ? pc.dim(text) : text
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function fit(text: string, width: number): string {
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width <= EDGE.length) return text.slice(0, width)
  return `${text.slice(0, width - EDGE.length)}${EDGE}`
}

function toRow(primitive: OffensivePrimitive): TableRow {
  const code = primitive.commands.at(0)?.code
  return {
    id: primitive.id,
    actions: primitive.actions.join(","),
    command: code === undefined ? "" : collapse(code),
  }
}

function renderTable(rows: readonly TableRow[]): string[] {
  const idWidth = Math.max("ID".length, ...rows.map((row) => row.id.length))
  const actions = rows.map((row) => fit(row.actions, MAX_ACTION_WIDTH))
  const actionWidth = Math.max("ACTIONS".length, ...actions.map((value) => value.length))
  // An unsized pty reports 0, and `0 ?? fallback` stays 0, which would shrink the
  // command column to its minimum on a terminal that simply had not been resized yet.
  const columns =
    process.stdout.columns !== undefined && process.stdout.columns > 0
      ? process.stdout.columns
      : DEFAULT_TERMINAL_WIDTH
  const commandWidth = Math.max(MIN_COMMAND_WIDTH, columns - idWidth - actionWidth - 4)

  return [
    bold(`${"ID".padEnd(idWidth)}  ${"ACTIONS".padEnd(actionWidth)}  COMMAND`),
    ...rows.map((row, position) =>
      [
        dim(row.id.padEnd(idWidth)),
        (actions[position] ?? "").padEnd(actionWidth),
        fit(row.command, commandWidth),
      ].join("  "),
    ),
  ]
}

function failed(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`arsenal: ${message}\n`)
  return RUNTIME_EXIT_CODE
}

function usageError(command: string, message: string): number {
  process.stderr.write(`arsenal ${command}: ${message}\n`)
  return USAGE_EXIT_CODE
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function noMatch(): number {
  process.stderr.write("no primitives matched\n")
  return RUNTIME_EXIT_CODE
}

async function openCorpus(arsenal: ArsenalModule, source?: string): Promise<Corpus> {
  const dataRoot = arsenal.resolveDataRoot()
  const wanted = source === undefined ? arsenal.ARSENAL_SOURCES : [source]
  const loaded = await Promise.all(
    wanted.map((name) => arsenal.loadPrimitives(dataRoot, name as (typeof arsenal.ARSENAL_SOURCES)[number])),
  )
  return { dataRoot, primitives: loaded.flat() }
}

function isPrivilege(value: string): value is Privilege {
  return PRIVILEGES.some((entry) => entry === value)
}

function isPlatform(value: string): value is Platform {
  return PLATFORMS.some((entry) => entry === value)
}

function isActionName(value: string): value is ActionName {
  return OFFENSIVE_ACTIONS.some((entry) => entry === value)
}

async function runIndex(arsenal: ArsenalModule, json: boolean): Promise<number> {
  const dataRoot = arsenal.resolveDataRoot()
  let index: ArsenalIndex
  try {
    index = await arsenal.loadIndex(dataRoot)
  } catch (error) {
    return failed(error)
  }

  const rows = arsenal.ARSENAL_SOURCES.map((source) => ({
    source,
    records: index.sources[source],
    pin: index.upstreamPins[source],
  }))
  const total = rows.reduce((sum, row) => sum + row.records, 0)

  if (json) {
    printJson({
      dataRoot,
      generatedAt: index.generatedAt,
      total,
      sources: index.sources,
      upstreamPins: index.upstreamPins,
    })
    return 0
  }

  const sourceWidth = Math.max("SOURCE".length, ...rows.map((row) => row.source.length))
  const recordsWidth = Math.max(
    "RECORDS".length,
    ...rows.map((row) => String(row.records).length),
    String(total).length,
  )
  const lines = [
    `${dim("arsenal corpus")}  ${dataRoot}`,
    `${dim("generated")}       ${index.generatedAt}`,
    "",
    bold(`${"SOURCE".padEnd(sourceWidth)}  ${"RECORDS".padStart(recordsWidth)}  PIN`),
    ...rows.map(
      (row) => `${dim(row.source.padEnd(sourceWidth))}  ${String(row.records).padStart(recordsWidth)}  ${row.pin}`,
    ),
    "",
    `${"total".padEnd(sourceWidth)}  ${String(total).padStart(recordsWidth)}`,
  ]
  process.stdout.write(`${lines.join("\n")}\n`)
  return 0
}

async function runSearch(arsenal: ArsenalModule, text: string, options: SearchOptions): Promise<number> {
  const action = options.action
  if (action !== undefined && !isActionName(action)) {
    return usageError("search", `--action must be one of ${OFFENSIVE_ACTIONS.join(", ")}`)
  }
  const platform = options.platform
  if (platform !== undefined && !isPlatform(platform)) {
    return usageError("search", `--platform must be one of ${PLATFORMS.join(", ")}`)
  }
  const source = options.source
  if (source !== undefined && !arsenal.ARSENAL_SOURCES.some((entry) => entry === source)) {
    return usageError("search", `--source must be one of ${arsenal.ARSENAL_SOURCES.join(", ")}`)
  }

  let corpus: Corpus
  try {
    corpus = await openCorpus(arsenal, source)
  } catch (error) {
    return failed(error)
  }

  const results = arsenal.searchPrimitives(corpus.primitives, {
    text,
    action,
    platform,
    source: source as (typeof arsenal.ARSENAL_SOURCES)[number] | undefined,
    mitre: options.mitre,
    limit: options.limit,
  })

  if (options.json === true) {
    printJson({
      dataRoot: corpus.dataRoot,
      query: {
        text,
        action: action ?? null,
        platform: platform ?? null,
        source: source ?? null,
        mitre: options.mitre ?? null,
      },
      count: results.length,
      primitives: results,
    })
    return 0
  }

  if (results.length === 0) {
    return noMatch()
  }

  process.stdout.write(`${renderTable(results.map(toRow)).join("\n")}\n`)
  process.stdout.write(`${dim(`${results.length} primitives`)}\n`)
  return 0
}

async function runForState(arsenal: ArsenalModule, options: ForStateOptions): Promise<number> {
  const privilege = options.privilege
  if (privilege === undefined || !isPrivilege(privilege)) {
    return usageError("for-state", `--privilege must be one of ${PRIVILEGES.join(", ")}`)
  }
  const platform = options.platform
  if (platform === undefined || !isPlatform(platform)) {
    return usageError("for-state", `--platform must be one of ${PLATFORMS.join(", ")}`)
  }

  let corpus: Corpus
  try {
    corpus = await openCorpus(arsenal)
  } catch (error) {
    return failed(error)
  }

  const state: ArsenalRankState = { privilege, platform, tty: options.tty !== false, hasShell: true }
  const ranked = arsenal.rankForState(state, corpus.primitives)

  if (options.json === true) {
    printJson({
      dataRoot: corpus.dataRoot,
      state,
      count: ranked.length,
      primitives: ranked,
    })
    return 0
  }

  if (ranked.length === 0) {
    return noMatch()
  }

  process.stdout.write(`${renderTable(ranked.map(toRow)).join("\n")}\n`)
  process.stdout.write(`${dim(`${ranked.length} primitives usable as ${privilege} on ${platform}`)}\n`)
  return 0
}

async function withArsenal(run: (arsenal: ArsenalModule) => Promise<number>): Promise<number> {
  try {
    // Loaded by package name, never a source-relative path: the declarations build
    // pins rootDir to this package's src, and a relative path to another package's
    // .ts source is rejected with TS6059.
    return await run((await import("@oh-my-cybersecurity/arsenal-core")) as unknown as ArsenalModule)
  } catch (error) {
    return failed(error)
  }
}

function usageExit(error: CommanderError): never {
  process.exit(error.exitCode === 0 ? 0 : USAGE_EXIT_CODE)
}

function parseLimit(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("limit must be a non-negative integer")
  }
  return Number.parseInt(value, 10)
}

export function configureArsenalCommand(program: Command): void {
  const arsenal = program
    .command("arsenal")
    .description("Query the absorbed offensive corpus (GTFOBins + LOLBAS) read from disk")
    .exitOverride(usageExit)

  arsenal
    .command("index")
    .description("Print corpus source record counts and the pinned upstream commits")
    .option("--json", "Output the index as JSON")
    .action(async (options: IndexOptions) => {
      process.exitCode = await withArsenal((module) => runIndex(module, options.json === true))
    })

  arsenal
    .command("search <text>")
    .description("Search primitives by text, action, platform, source, or MITRE technique")
    .option("--action <action>", `Offensive action filter: ${OFFENSIVE_ACTIONS.join(", ")}`)
    .option("--platform <platform>", `Platform filter: ${PLATFORMS.join(", ")}`)
    .option("--source <source>", "Corpus source filter: gtfobins, lolbas")
    .option("--mitre <id>", "MITRE ATT&CK technique id filter, for example T1059")
    .option("--limit <n>", "Maximum primitives to print (default 50, hard cap 500)", parseLimit)
    .option("--json", "Output the matched primitives as JSON")
    .action(async (text: string, options: SearchOptions) => {
      process.exitCode = await withArsenal((module) => runSearch(module, text, options))
    })

  arsenal
    .command("for-state")
    .description("Rank the primitives usable from a given privilege and platform state")
    .requiredOption("--privilege <level>", `Privilege context: ${PRIVILEGES.join(", ")}`)
    .requiredOption("--platform <platform>", `Target platform: ${PLATFORMS.join(", ")}`)
    .option("--no-tty", "Assume no controlling TTY is attached")
    .option("--json", "Output the ranked primitives as JSON")
    .action(async (options: ForStateOptions) => {
      process.exitCode = await withArsenal((module) => runForState(module, options))
    })
}
