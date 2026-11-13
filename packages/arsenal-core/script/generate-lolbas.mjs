#!/usr/bin/env node
/**
 * Generates the LOLBAS Windows living-off-the-land corpus as typed JSON.
 *
 *   node packages/arsenal-core/script/generate-lolbas.mjs [source-dir] [output-dir]
 *
 * LOCAL ARTIFACT, NEVER COMMITTED. Upstream LOLBAS is GPL-3.0 and this repository
 * is SUL-1.0, so the derived corpus must not enter this repository's history.
 * Rebuild it from your own clone:
 *
 *   git clone --depth 1 https://github.com/LOLBAS-Project/LOLBAS <dir>
 *   node packages/arsenal-core/script/generate-lolbas.mjs <dir>
 *
 * Source root: argv[2], else $OMC_ARSENAL_SOURCE, else the pinned local checkout.
 * Output root: argv[3], else $OMC_ARSENAL_ROOT, else this package's data/. The
 * absolute path of every file written is printed. Output is a pure function of the
 * source tree - `generatedAt` is the source commit's own committer date, never
 * wall-clock time - so re-running against a checkout is byte-identical.
 *
 * CommandItem -> PrimitiveCommand: code=Command, description=Description,
 * usecase=Usecase, category=Category (upstream's 15-value taxonomy verbatim),
 * privileges=Privileges, contexts=[] (LOLBAS has no GTFOBins-style execution
 * context axis, so [] is the honest answer). MitreID is lifted to the primitive's
 * `mitre` (deduplicated, sorted), Category to its mapped OffensiveAction. Each
 * `Tags` entry is a single-key map flattened to "Key: Value" so the facet name
 * survives the string[] contract. `OperatingSystem`, `Aliases`, `Code_Sample`,
 * `Detection`, `Resources`, `Acknowledgement` and `Full_Path` stay upstream.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { load } from "js-yaml"

export const SOURCE = "lolbas"
export const UPSTREAM_URL = "https://github.com/LOLBAS-Project/LOLBAS"
export const DEFAULT_SOURCE_DIR = "/root/omo-cyber/src/LOLBAS"
export const OUTPUT_ROOT_ENV = "OMC_ARSENAL_ROOT"
export const SOURCE_DIR_ENV = "OMC_ARSENAL_SOURCE"
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const GENERATOR_PATH = fileURLToPath(import.meta.url)

const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..")
const CORPUS_DIR = "yml"
const PLATFORM = ["windows"]
const MITRE_RE = /^T[0-9]{4}(\.[0-9]{3})?$/

// Upstream's 15-value Category taxonomy mapped onto the OffensiveAction union.
// Total by construction: an unmapped value aborts the run rather than silently
// dropping a technique.
export const CATEGORY_ACTIONS = {
  ADS: "persistence",
  "AWL Bypass": "defense-evasion",
  Compile: "execute",
  Conceal: "defense-evasion",
  Copy: "file-write",
  Credentials: "credential-access",
  Decode: "recon",
  Download: "download",
  Dump: "credential-access",
  Encode: "defense-evasion",
  Execute: "execute",
  Reconnaissance: "recon",
  Tamper: "defense-evasion",
  "UAC Bypass": "uac-bypass",
  Upload: "upload",
}

export function operatorCommand(dir) {
  return `git clone --depth 1 ${UPSTREAM_URL} ${dir} && node ${relative(REPO_ROOT, GENERATOR_PATH)} ${dir}`
}

function fromEnv(name, env) {
  const value = env === undefined ? undefined : env[name]
  return typeof value === "string" && value.trim() !== "" ? resolve(value) : undefined
}

export function resolveOutputRoot({ explicit, env } = {}) {
  if (typeof explicit === "string" && explicit.trim() !== "") return resolve(explicit)
  return fromEnv(OUTPUT_ROOT_ENV, env) ?? resolve(PACKAGE_ROOT, "data")
}

export function resolveSourceDir({ explicit, env } = {}) {
  if (typeof explicit === "string" && explicit.trim() !== "") return resolve(explicit)
  return fromEnv(SOURCE_DIR_ENV, env) ?? resolve(DEFAULT_SOURCE_DIR)
}

const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const uniqueSorted = (values) => [...new Set(values)].sort(byCodepoint)
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value)

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git ${args.join(" ")} failed in ${dir}: ${detail}\nbuild the source from your own clone:\n  ${operatorCommand(dir)}`)
  }
}

function listRecords(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listRecords(full, base, out)
    else if (entry.isFile() && entry.name.endsWith(".yml")) out.push(relative(base, full).split(sep).join("/"))
  }
  return out.sort(byCodepoint)
}

function readString(file, where, value) {
  if (typeof value !== "string") throw new Error(`${file}: ${where} must be a string`)
  return value
}

function requireString(file, where, value) {
  const text = readString(file, where, value)
  if (text.trim() === "") throw new Error(`${file}: ${where} must not be empty`)
  return text
}

function tagLabels(file, where, tags) {
  if (tags === undefined || tags === null) return []
  if (!Array.isArray(tags)) throw new Error(`${file}: ${where}.Tags must be a list of single-key maps`)
  return tags.map((tag) => {
    if (!isRecord(tag) || Object.keys(tag).length !== 1) {
      throw new Error(`${file}: ${where}.Tags entries must be single-key maps`)
    }
    const [key] = Object.keys(tag)
    return `${key}: ${readString(file, `${where}.Tags.${key}`, tag[key])}`
  })
}

function toCommand(file, index, item) {
  const where = `Commands[${index}]`
  if (!isRecord(item)) throw new Error(`${file}: ${where} is not a mapping`)
  const category = requireString(file, `${where}.Category`, item.Category)
  const action = CATEGORY_ACTIONS[category]
  if (action === undefined) {
    throw new Error(`${file}: ${where}.Category ${JSON.stringify(category)} has no OffensiveAction mapping`)
  }
  const mitre = requireString(file, `${where}.MitreID`, item.MitreID)
  if (!MITRE_RE.test(mitre)) {
    throw new Error(`${file}: ${where}.MitreID ${JSON.stringify(mitre)} is not a MITRE technique id`)
  }
  return {
    command: {
      code: requireString(file, `${where}.Command`, item.Command),
      description: readString(file, `${where}.Description`, item.Description),
      usecase: requireString(file, `${where}.Usecase`, item.Usecase),
      category,
      privileges: readString(file, `${where}.Privileges`, item.Privileges),
      contexts: [],
    },
    action,
    mitre,
    tags: tagLabels(file, where, item.Tags),
  }
}

function toPrimitive(file, doc) {
  if (!isRecord(doc)) throw new Error(`${file}: record is not a mapping`)
  const name = requireString(file, "Name", doc.Name)
  if (!Array.isArray(doc.Commands)) throw new Error(`${file}: Commands must be a list`)

  const commands = []
  const actions = new Set()
  const mitre = new Set()
  const tags = new Set()
  doc.Commands.forEach((item, index) => {
    const parsed = toCommand(file, index, item)
    commands.push(parsed.command)
    actions.add(parsed.action)
    mitre.add(parsed.mitre)
    for (const tag of parsed.tags) tags.add(tag)
  })

  return {
    source: SOURCE,
    id: `${SOURCE}:${name}`,
    binary: name,
    name,
    description: readString(file, "Description", doc.Description),
    actions: uniqueSorted(actions),
    platform: [...PLATFORM],
    mitre: uniqueSorted(mitre),
    commands,
    tags: uniqueSorted(tags),
  }
}

export function generate({ sourceDir, outputRoot }) {
  const corpusDir = join(sourceDir, CORPUS_DIR)
  const records = existsSync(corpusDir) ? listRecords(corpusDir) : []
  if (records.length === 0) {
    throw new Error(`no upstream corpus at ${corpusDir}\nbuild it from your own clone:\n  ${operatorCommand(sourceDir)}`)
  }

  const primitives = records
    .map((rel) => toPrimitive(rel, load(readFileSync(join(corpusDir, rel), "utf8"))))
    .sort((a, b) => byCodepoint(a.id, b.id))
  const pins = { [SOURCE]: git(sourceDir, ["rev-parse", "HEAD"]) }
  const corpus = { primitives, pins, generatedAt: git(sourceDir, ["show", "-s", "--format=%cI", "HEAD"]) }

  mkdirSync(outputRoot, { recursive: true })
  const files = [join(outputRoot, `${SOURCE}.json`), join(outputRoot, `${SOURCE}.pin.txt`)]
  writeFileSync(files[0], `${JSON.stringify(corpus, null, 2)}\n`)
  writeFileSync(files[1], `${pins[SOURCE]}\n`)

  const commands = primitives.reduce((total, primitive) => total + primitive.commands.length, 0)
  return { primitives: primitives.length, commands, pin: pins[SOURCE], files }
}

function main() {
  const declared = Object.keys(CATEGORY_ACTIONS).length
  if (declared !== 15) throw new Error(`the Category mapping must cover all 15 upstream values, found ${declared}`)
  const result = generate({
    sourceDir: resolveSourceDir({ explicit: process.argv[2], env: process.env }),
    outputRoot: resolveOutputRoot({ explicit: process.argv[3], env: process.env }),
  })
  process.stdout.write(`${SOURCE}: ${result.primitives} primitives, ${result.commands} commands, pin ${result.pin}\n`)
  for (const file of result.files) process.stdout.write(`wrote ${file}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === GENERATOR_PATH) main()
