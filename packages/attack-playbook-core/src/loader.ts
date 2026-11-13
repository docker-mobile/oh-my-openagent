import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { AtomicTest, PlaybookIndex, Technique } from "./types"

// Loads the generated corpus from DISK at runtime. This is load-bearing: the
// corpus is megabytes of JSON and MUST NEVER be inlined into a TS module or
// statically imported, because that would pull it into the bundle.

export class PlaybookLoadError extends Error {
  readonly filePath: string

  constructor(message: string, filePath: string, cause?: unknown) {
    super(message, { cause })
    this.name = "PlaybookLoadError"
    this.filePath = filePath
  }
}

export function techniquesFilePath(dataRoot: string): string {
  return join(dataRoot, "techniques.json")
}

export function indexFilePath(dataRoot: string): string {
  return join(dataRoot, "index.json")
}

// Resolved from this module, never from the process cwd, so the loader behaves
// identically under `bun test`, a CLI, and the bundled plugin. `import.meta.dir`
// is Bun-only and this module is reachable from the compiled Node CLI, where it
// is undefined and would throw inside path.join.
export function defaultDataRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data")
}

// The generator writes an envelope ({techniques, pin, generatedAt}); the loader
// accepts either that envelope or a bare array, so a hand-written corpus works too.
function unwrap(parsed: unknown, key: string): unknown {
  return isRecord(parsed) && key in parsed ? parsed[key] : parsed
}

export async function loadTechniques(dataRoot: string): Promise<Technique[]> {
  const filePath = techniquesFilePath(dataRoot)
  const parsed = unwrap(await readJsonFile(filePath), "techniques")
  assertTechniques(parsed, filePath)
  return parsed
}

export async function loadPlaybookIndex(dataRoot: string): Promise<PlaybookIndex> {
  const filePath = indexFilePath(dataRoot)
  const parsed = await readJsonFile(filePath)
  assertIndex(parsed, filePath)
  return parsed
}

async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string
  try {
    // `Bun.file` is unavailable under Node and this module ships in the compiled CLI,
    // so node:fs is the reader that works in both runtimes.
    text = await readFile(filePath, "utf-8")
  } catch (cause) {
    throw new PlaybookLoadError(
      `Attack playbook corpus file is missing: ${filePath}. Run the corpus generator to write it.`,
      filePath,
      cause,
    )
  }
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new PlaybookLoadError(
      `Attack playbook corpus file is not valid JSON: ${filePath}`,
      filePath,
      cause,
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function isAtomicTest(value: unknown): value is AtomicTest {
  if (!isRecord(value)) {
    return false
  }
  const { executor, arguments: inputArguments } = value
  return (
    typeof value.technique === "string" &&
    typeof value.displayName === "string" &&
    typeof value.index === "number" &&
    typeof value.guid === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isStringArray(value.platforms) &&
    isRecord(inputArguments) &&
    Array.isArray(value.dependencies) &&
    isRecord(executor) &&
    typeof value.manual === "boolean"
  )
}

function isTechnique(value: unknown): value is Technique {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    isStringArray(value.tactics) &&
    Array.isArray(value.atomics) &&
    value.atomics.every(isAtomicTest)
  )
}

function assertTechniques(value: unknown, filePath: string): asserts value is Technique[] {
  if (!Array.isArray(value) || !value.every(isTechnique)) {
    throw new PlaybookLoadError(
      `Attack playbook corpus file has an invalid shape: ${filePath}`,
      filePath,
    )
  }
}

function assertIndex(value: unknown, filePath: string): asserts value is PlaybookIndex {
  if (!isRecord(value)) {
    throw new PlaybookLoadError(
      `Attack playbook index file has an invalid shape: ${filePath}`,
      filePath,
    )
  }
  if (
    typeof value.techniques !== "number" ||
    typeof value.atomics !== "number" ||
    typeof value.generatedAt !== "string" ||
    typeof value.pin !== "string"
  ) {
    throw new PlaybookLoadError(
      `Attack playbook index file has an invalid shape: ${filePath}`,
      filePath,
    )
  }
}
