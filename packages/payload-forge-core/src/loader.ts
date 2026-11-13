import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { PAYLOAD_KINDS, type PayloadIndex, type PayloadKind, type PayloadTemplate, type PayloadVariable, type WordlistEntry } from "./types"

// Loads generated JSON from DISK at runtime. This is load-bearing: the generated
// corpora are megabytes (87 KB of templates, 2.8 MB of wordlists at the pin) and
// MUST NEVER be inlined into a TS module, because the repo bundle budget is
// already exceeded and a static import would inline them.

export class CorpusLoadError extends Error {
  readonly filePath: string

  constructor(message: string, filePath: string, cause?: unknown) {
    super(message, { cause })
    this.name = "CorpusLoadError"
    this.filePath = filePath
  }
}

export function templatesFilePath(dataRoot: string): string {
  return join(dataRoot, "templates.json")
}

export function wordlistsFilePath(dataRoot: string): string {
  return join(dataRoot, "wordlists.json")
}

export function payloadIndexFilePath(dataRoot: string): string {
  return join(dataRoot, "index.json")
}

// Resolved against this module so every path holds regardless of the caller's cwd.
// `import.meta.dir` is Bun-only and this module is reachable from the compiled
// Node CLI, where it is undefined and would throw inside path.join.
export function defaultDataRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data")
}

// The generator writes envelopes ({templates|families, pin, generatedAt}); the
// loader accepts either the envelope or a bare array.
function unwrap(parsed: unknown, key: string): unknown {
  return isRecord(parsed) && key in parsed ? parsed[key] : parsed
}

export async function loadTemplates(dataRoot: string): Promise<PayloadTemplate[]> {
  const filePath = templatesFilePath(dataRoot)
  const parsed = unwrap(await readJsonFile(filePath), "templates")
  if (!Array.isArray(parsed) || !parsed.every(isTemplate)) {
    throw new CorpusLoadError(`payload templates file has an invalid shape: ${filePath}`, filePath)
  }
  return parsed
}

export async function loadWordlists(dataRoot: string): Promise<WordlistEntry[]> {
  const filePath = wordlistsFilePath(dataRoot)
  const parsed = unwrap(await readJsonFile(filePath), "families")
  if (!Array.isArray(parsed) || !parsed.every(isWordlistEntry)) {
    throw new CorpusLoadError(`payload wordlists file has an invalid shape: ${filePath}`, filePath)
  }
  return parsed
}

// payload-forge has no separate index file: the counts are derived from the two
// corpora it does ship, so an absent index is a normal state rather than a fault.
export async function loadPayloadIndex(dataRoot: string): Promise<PayloadIndex> {
  const [templates, families, pin] = await Promise.all([
    loadTemplates(dataRoot),
    loadWordlists(dataRoot),
    readPin(dataRoot),
  ])
  return derivedPayloadIndex(templates, families, pin)
}

async function readPin(dataRoot: string): Promise<string> {
  try {
    return (await readFile(join(dataRoot, "payloads.pin.txt"), "utf-8")).trim()
  } catch {
    return "unknown"
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string
  try {
    // `Bun.file` is unavailable under Node and this module ships in the compiled CLI,
    // so node:fs is the reader that works in both runtimes.
    text = await readFile(filePath, "utf-8")
  } catch (cause) {
    throw new CorpusLoadError(`payload corpus file is missing: ${filePath}`, filePath, cause)
  }
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new CorpusLoadError(`payload corpus file is not valid JSON: ${filePath}`, filePath, cause)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function isPayloadKind(value: unknown): value is PayloadKind {
  return typeof value === "string" && (PAYLOAD_KINDS as readonly string[]).includes(value)
}

function isVariable(value: unknown): value is PayloadVariable {
  if (!isRecord(value)) return false
  return (
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (value.defaultValue === null || typeof value.defaultValue === "string")
  )
}

function isTemplate(value: unknown): value is PayloadTemplate {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isPayloadKind(value.kind) &&
    typeof value.category === "string" &&
    typeof value.body === "string" &&
    Array.isArray(value.variables) &&
    value.variables.every(isVariable) &&
    typeof value.source === "string" &&
    isStringArray(value.tags)
  )
}

function isWordlistEntry(value: unknown): value is WordlistEntry {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.family === "string" &&
    typeof value.lines === "number" &&
    Number.isInteger(value.lines) &&
    value.lines >= 0 &&
    typeof value.sourcePath === "string"
  )
}

function isPayloadIndex(value: unknown): value is PayloadIndex {
  if (!isRecord(value)) return false
  return (
    typeof value.templates === "number" &&
    Number.isInteger(value.templates) &&
    value.templates >= 0 &&
    typeof value.families === "number" &&
    Number.isInteger(value.families) &&
    value.families >= 0 &&
    typeof value.generatedAt === "string" &&
    typeof value.pin === "string"
  )
}

export function derivedPayloadIndex(
  templates: readonly PayloadTemplate[],
  families: readonly WordlistEntry[],
  pin: string,
): PayloadIndex {
  const index: PayloadIndex = {
    templates: templates.length,
    families: families.length,
    generatedAt: new Date(0).toISOString(),
    pin,
  }
  if (!isPayloadIndex(index)) {
    throw new CorpusLoadError("derived payload index is malformed", "")
  }
  return index
}
