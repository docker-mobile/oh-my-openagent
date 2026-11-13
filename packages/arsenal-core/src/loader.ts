import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { ARSENAL_SOURCES, type ArsenalIndex, type ArsenalSource, type OffensivePrimitive } from "./types"

// Loads generated JSON from DISK at runtime. This is load-bearing: the generated
// corpora are megabytes and MUST NEVER be inlined into a TS module, because the
// repo's bundle budget is already exceeded and a static import would inline them.

export class CorpusLoadError extends Error {
  readonly filePath: string
  readonly source: ArsenalSource | undefined

  constructor(message: string, filePath: string, source: ArsenalSource | undefined, cause?: unknown) {
    super(message, { cause })
    this.name = "CorpusLoadError"
    this.filePath = filePath
    this.source = source
  }
}

export function primitivesFilePath(dataRoot: string, source: ArsenalSource): string {
  return join(dataRoot, `${source}.json`)
}

export function indexFilePath(dataRoot: string): string {
  return join(dataRoot, "index.json")
}

export function defaultDataRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data")
}

/**
 * Candidate roots for the generated corpus, most-specific first. The bundled CLI
 * inlines this module into dist/, so the module-relative path alone resolves to
 * dist/data and misses the package's own data directory. Every candidate is a
 * real layout: the package (source), the package (packed), and the repo checkout.
 */
export function dataRootCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const repoRoot = join(here, "..", "..", "..")
  return [
    join(here, "..", "data"),
    join(repoRoot, "packages", "arsenal-core", "data"),
    join(process.cwd(), "packages", "arsenal-core", "data"),
    join(process.cwd(), ".omc", "arsenal"),
  ]
}

/** The first candidate that actually holds an index file, else the module-relative default. */
export function resolveDataRoot(explicit?: string): string {
  if (explicit !== undefined && explicit.length > 0) return explicit
  const fromEnv = process.env.OMC_ARSENAL_ROOT
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  for (const candidate of dataRootCandidates()) {
    if (existsSync(indexFilePath(candidate))) return candidate
  }
  return defaultDataRoot()
}

// The generators write an envelope ({primitives, pins, generatedAt}); the loader
// accepts either that envelope or a bare array, so a hand-written corpus works too.
function unwrapPrimitives(parsed: unknown): unknown {
  return isRecord(parsed) && "primitives" in parsed ? parsed.primitives : parsed
}

export async function loadPrimitives(dataRoot: string, source: ArsenalSource): Promise<OffensivePrimitive[]> {
  const filePath = primitivesFilePath(dataRoot, source)
  const parsed = unwrapPrimitives(await readJsonFile(filePath, source))
  assertPrimitives(parsed, filePath, source)
  return parsed
}

export async function loadIndex(dataRoot: string): Promise<ArsenalIndex> {
  const filePath = indexFilePath(dataRoot)
  const parsed = await readJsonFile(filePath, undefined)
  assertIndex(parsed, filePath)
  return parsed
}

async function readJsonFile(filePath: string, source: ArsenalSource | undefined): Promise<unknown> {
  let text: string
  try {
    text = await readFile(filePath, "utf-8")
  } catch (cause) {
    // `Bun.file` is unavailable under Node, and this module is reachable from the
    // compiled CLI, so node:fs is the only reader that works in both runtimes.
    throw new CorpusLoadError(`Arsenal corpus file is missing: ${filePath}`, filePath, source, cause)
  }
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new CorpusLoadError(`Arsenal corpus file is not valid JSON: ${filePath}`, filePath, source, cause)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function isPrimitiveCommand(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.code === "string" &&
    typeof value.description === "string" &&
    typeof value.usecase === "string" &&
    typeof value.category === "string" &&
    typeof value.privileges === "string" &&
    isStringArray(value.contexts) &&
    (value.variant === undefined || typeof value.variant === "string")
  )
}

function isPrimitive(value: unknown): value is OffensivePrimitive {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.source === "string" &&
    typeof value.id === "string" &&
    typeof value.binary === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isStringArray(value.actions) &&
    isStringArray(value.platform) &&
    isStringArray(value.mitre) &&
    isStringArray(value.tags) &&
    Array.isArray(value.commands) &&
    value.commands.every(isPrimitiveCommand)
  )
}

function assertPrimitives(
  value: unknown,
  filePath: string,
  source: ArsenalSource,
): asserts value is OffensivePrimitive[] {
  if (!Array.isArray(value) || !value.every(isPrimitive)) {
    throw new CorpusLoadError(`Arsenal corpus file has an invalid shape: ${filePath}`, filePath, source)
  }
  for (const primitive of value) {
    if (primitive.source !== source) {
      throw new CorpusLoadError(
        `Arsenal corpus file declares source "${primitive.source}" but was loaded as "${source}": ${filePath}`,
        filePath,
        source,
      )
    }
  }
}

function assertIndex(value: unknown, filePath: string): asserts value is ArsenalIndex {
  if (!isRecord(value) || typeof value.generatedAt !== "string") {
    throw new CorpusLoadError(`Arsenal index file has an invalid shape: ${filePath}`, filePath, undefined)
  }
  const { sources, upstreamPins } = value
  if (!isRecord(sources) || !isRecord(upstreamPins)) {
    throw new CorpusLoadError(`Arsenal index file has an invalid shape: ${filePath}`, filePath, undefined)
  }
  for (const source of ARSENAL_SOURCES) {
    if (typeof sources[source] !== "number" || typeof upstreamPins[source] !== "string") {
      throw new CorpusLoadError(
        `Arsenal index file is missing the "${source}" entry: ${filePath}`,
        filePath,
        undefined,
      )
    }
  }
}
