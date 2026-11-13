import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ARSENAL_SOURCES = ["gtfobins", "lolbas"]
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "..", "..", "..")

function resolveDataRoot() {
  const explicit = process.argv[2]
  if (explicit !== undefined && explicit.length > 0) return resolve(explicit)
  const fromEnv = process.env.OMC_ARSENAL_ROOT
  if (fromEnv !== undefined && fromEnv.length > 0) return resolve(fromEnv)
  return join(REPO_ROOT, "packages", "arsenal-core", "data")
}

function readPin(dataRoot, source) {
  try {
    return readFileSync(join(dataRoot, `${source}.pin.txt`), "utf-8").trim()
  } catch {
    return "unknown"
  }
}

function countPrimitives(dataRoot, source) {
  const raw = JSON.parse(readFileSync(join(dataRoot, `${source}.json`), "utf-8"))
  return Array.isArray(raw) ? raw.length : (raw.primitives?.length ?? 0)
}

const dataRoot = resolveDataRoot()
const sources = {}
const upstreamPins = {}

for (const source of ARSENAL_SOURCES) {
  sources[source] = countPrimitives(dataRoot, source)
  upstreamPins[source] = readPin(dataRoot, source)
}

const index = {
  sources,
  upstreamPins,
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
}

mkdirSync(dirname(join(dataRoot, "index.json")), { recursive: true })
writeFileSync(join(dataRoot, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf-8")
process.stdout.write(`wrote ${join(dataRoot, "index.json")}\n`)
process.stdout.write(`${JSON.stringify(sources)}\n`)
