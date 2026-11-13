#!/usr/bin/env node
/**
 * Generates the MITRE ATT&CK atomic-test corpus as typed JSON.
 *
 *   node packages/attack-playbook-core/script/generate-playbook.mjs [source-dir] [output-dir]
 *
 * Source defaults to the pinned atomic-red-team checkout, output to this package's
 * data directory. Output is a pure function of the source tree - `generatedAt` is the
 * source commit's own committer date, never a wall clock - so a re-run against the same
 * checkout leaves techniques.json byte-identical and `cmp` passes. Writes techniques.json
 * (the corpus envelope), index.json (the frozen PlaybookIndex src/loader.ts reads), and
 * playbook.pin.txt. Upstream attribution lives in NOTICE, not here.
 *
 * Field mapping onto the frozen contract in ../src/types.ts: id/displayName are
 * attack_technique/display_name; tactics come from atomics/Indexes/index.yaml (upstream's
 * tactic -> id map, deduplicated and sorted, since one technique can sit under several
 * tactics) and stay empty when that index is absent; atomics keep source order with a
 * 0-based index and denormalized technique/displayName; platforms are supported_platforms
 * in first-occurrence order; arguments are input_arguments with sorted keys, lowercased
 * type, stringified default (the contract is `string | null`); dependencies carry the
 * atomic-level dependency_executor_name as their executor; manual mirrors the executor.
 *
 * Normalisation decisions, recorded because each is lossy:
 *   - `command_prompt` is cmd.exe, which the ExecutorType union spells `command`; the rest
 *     of upstream's names are already members. A name outside the union, or an absent one,
 *     degrades to `manual`: an unrecognised executor must not be advertised as auto-runnable
 *     under shell semantics this generator cannot vouch for. Its body is preserved in
 *     `steps` rather than dropped and `command` stays empty. No shipped atomic hits this.
 *   - A dependency with no dependency_executor_name runs in the atomic's own language.
 *   - A platform outside TechniquePlatform maps to `unknown` (`iaas:<cloud>` maps to
 *     `iaas`); the atomic is kept either way.
 *   - Manual atomics keep their instructions verbatim in `steps`, one entry per line.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { load, JSON_SCHEMA } from "js-yaml"

// Resolved from this module, never from the process cwd, so the defaults hold under
// both Node and Bun from any working directory.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SOURCE_DIR = "/root/omo-cyber/src/atomic-red-team"
// Resolves to packages/attack-playbook-core/data - the same root src/loader.ts uses.
const DEFAULT_OUTPUT_DIR = join(SCRIPT_DIR, "..", "data")
const ATOMICS_DIR = "atomics"
const TACTIC_INDEX_FILE = join(ATOMICS_DIR, "Indexes", "index.yaml")
const TECHNIQUE_ID = /^T[0-9]{4}(\.[0-9]{3})?$/

const EXECUTOR_NAMES = ["command", "sh", "bash", "powershell", "pwsh", "python", "manual"]
const EXECUTOR_ALIASES = { command_prompt: "command" }
const EXECUTOR_FALLBACK = "manual"

const PLATFORM_NAMES = [
  "windows",
  "linux",
  "macos",
  "containers",
  "iaas",
  "network",
  "office-365",
  "azure-ad",
  "google-workspace",
  "saas",
  "iac",
  "unknown",
]
const PLATFORM_ALIASES = { "iaas:aws": "iaas", "iaas:azure": "iaas", "iaas:gcp": "iaas" }
const PLATFORM_FALLBACK = "unknown"

const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value) =>
  typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)
const present = (value) => (typeof value === "string" && value.trim() !== "" ? value : "")

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git ${args.join(" ")} failed in ${dir}: ${detail}`)
  }
}

function executorName(raw) {
  if (typeof raw !== "string" || raw === "") return EXECUTOR_FALLBACK
  if (EXECUTOR_NAMES.includes(raw)) return raw
  return EXECUTOR_ALIASES[raw] ?? EXECUTOR_FALLBACK
}

function executorOf(executor) {
  const node = isRecord(executor) ? executor : {}
  const name = executorName(node.name)
  const stepsSource = name === "manual" ? present(node.steps) || present(node.command) : ""
  return {
    name,
    command: name === "manual" ? "" : text(node.command),
    cleanupCommand:
      name === "manual" || typeof node.cleanup_command !== "string" ? null : node.cleanup_command,
    elevationRequired: node.elevation_required === true,
    steps: stepsSource === "" ? [] : stepsSource.split("\n"),
  }
}

function platformsOf(supported) {
  if (!Array.isArray(supported)) return []
  const platforms = []
  for (const entry of supported) {
    const name = text(entry)
    const resolved = PLATFORM_NAMES.includes(name) ? name : (PLATFORM_ALIASES[name] ?? PLATFORM_FALLBACK)
    if (!platforms.includes(resolved)) platforms.push(resolved)
  }
  return platforms
}

function argumentsOf(input) {
  if (!isRecord(input)) return {}
  const args = {}
  for (const key of Object.keys(input).sort(byCodepoint)) {
    const arg = isRecord(input[key]) ? input[key] : {}
    args[key] = {
      description: text(arg.description),
      type: text(arg.type).toLowerCase(),
      default: arg.default === undefined || arg.default === null ? null : String(arg.default),
    }
  }
  return args
}

function dependenciesOf(test, atomicExecutor) {
  if (!Array.isArray(test.dependencies)) return []
  const declared = test.dependency_executor_name
  const executor =
    typeof declared === "string" && declared !== "" ? executorName(declared) : atomicExecutor
  return test.dependencies.map((dependency) => {
    const node = isRecord(dependency) ? dependency : {}
    return {
      description: text(node.description),
      prereqCommand: text(node.prereq_command),
      getPrereqCommand: typeof node.get_prereq_command === "string" ? node.get_prereq_command : null,
      executor,
    }
  })
}

function toAtomic(test, technique, index, guids) {
  if (!isRecord(test)) throw new Error(`${technique.id} atomic #${index} is not a mapping`)
  const guid = text(test.auto_generated_guid)
  if (guid === "") {
    throw new Error(`${technique.id} atomic #${index} ("${text(test.name)}") has no auto_generated_guid`)
  }
  const seen = guids.get(guid)
  if (seen !== undefined) {
    throw new Error(`duplicate auto_generated_guid ${guid}: ${seen} and ${technique.id} atomic #${index}`)
  }
  guids.set(guid, `${technique.id} atomic #${index}`)

  const executor = executorOf(test.executor)
  return {
    technique: technique.id,
    displayName: technique.displayName,
    index,
    guid,
    name: text(test.name),
    description: text(test.description),
    platforms: platformsOf(test.supported_platforms),
    arguments: argumentsOf(test.input_arguments),
    dependencies: dependenciesOf(test, executor.name),
    executor,
    manual: executor.name === "manual",
  }
}

// Tactic -> technique-id map. Upstream ships it as atomics/Indexes/index.yaml.
function readTacticIndex(sourceDir) {
  const file = join(sourceDir, TACTIC_INDEX_FILE)
  const tactics = new Map()
  if (!existsSync(file)) {
    process.stderr.write(`attack-playbook: no tactic index at ${file}; tactics stay empty\n`)
    return tactics
  }
  const doc = load(readFileSync(file, "utf8"), { schema: JSON_SCHEMA })
  if (!isRecord(doc)) return tactics
  for (const [tactic, entries] of Object.entries(doc)) {
    if (!isRecord(entries)) continue
    for (const id of Object.keys(entries)) {
      const found = tactics.get(id) ?? new Set()
      found.add(tactic)
      tactics.set(id, found)
    }
  }
  return tactics
}

function readTechniques(sourceDir, tacticIndex) {
  const dir = join(sourceDir, ATOMICS_DIR)
  const guids = new Map()
  const techniques = []
  for (const entry of readdirSync(dir)) {
    if (!TECHNIQUE_ID.test(entry)) continue
    const file = join(dir, entry, `${entry}.yaml`)
    const doc = load(readFileSync(file, "utf8"), { schema: JSON_SCHEMA })
    const id = text(doc.attack_technique)
    if (id !== entry) {
      throw new Error(`${file}: attack_technique ${id} does not match its directory ${entry}`)
    }
    if (!Array.isArray(doc.atomic_tests) || doc.atomic_tests.length === 0) {
      throw new Error(`${file}: atomic_tests is empty`)
    }
    const technique = {
      id,
      displayName: text(doc.display_name),
      tactics: [...(tacticIndex.get(id) ?? [])].sort(byCodepoint),
      atomics: [],
    }
    for (const [index, test] of doc.atomic_tests.entries()) {
      technique.atomics.push(toAtomic(test, technique, index, guids))
    }
    techniques.push(technique)
  }
  return techniques.sort((a, b) => byCodepoint(a.id, b.id))
}

function main() {
  const sourceDir = resolve(process.argv[2] ?? DEFAULT_SOURCE_DIR)
  const outputDir = resolve(process.argv[3] ?? DEFAULT_OUTPUT_DIR)

  const techniques = readTechniques(sourceDir, readTacticIndex(sourceDir))
  const pin = git(sourceDir, ["rev-parse", "HEAD"])
  const generatedAt = git(sourceDir, ["show", "-s", "--format=%cI", "HEAD"])
  const atomics = techniques.reduce((total, technique) => total + technique.atomics.length, 0)

  const corpus = { techniques, pin, generatedAt }
  const index = { techniques: techniques.length, atomics, generatedAt, pin }

  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, "techniques.json"), `${JSON.stringify(corpus, null, 2)}\n`)
  writeFileSync(join(outputDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`)
  writeFileSync(join(outputDir, "playbook.pin.txt"), `${pin}\n`)

  process.stdout.write(
    `attack-playbook: ${techniques.length} techniques, ${atomics} atomics, pin ${pin}\n`,
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`attack-playbook: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
