#!/usr/bin/env node
/**
 * Generates the GTFOBins Unix binary-abuse corpus as typed JSON.
 *
 *   node packages/arsenal-core/script/generate-gtfobins.mjs [source-dir] [output-dir]
 *
 * The corpus is a GENERATED LOCAL ARTIFACT, never a committed file: upstream is
 * GPL-3.0 while this product is SUL-1.0, so the derived data must not become a
 * tracked repository file. Attribution lives in NOTICE, not here.
 *
 * Output root: argv[3]; else $OMC_ARSENAL_ROOT; else <repo>/packages/arsenal-core/data.
 * Source: argv[2]; else $OMC_ARSENAL_SOURCE; else the pinned checkout below. The output
 * directory is created recursively and every absolute path written is printed.
 *
 * `generatedAt` is the source commit's own committer date and every emitted key order is
 * fixed, so re-running against the same checkout is byte-identical. Alias-only records
 * (e.g. `awk -> mawk`) resolve to their target, chains included, and a cycle is rejected
 * rather than silently truncated.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { load } from "js-yaml"

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..")
const DEFAULT_SOURCE_DIR = "/root/omo-cyber/src/GTFOBins"
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, "packages", "arsenal-core", "data")
const CORPUS_DIR = "_gtfobins"
const REGISTRY_FILE = join("_data", "functions.yml")
const SOURCE = "gtfobins"
const INHERIT = "inherit"
const PLATFORM = ["linux", "macos", "unix"]
const CONTEXT_ORDER = ["unprivileged", "sudo", "suid", "capabilities"]
// Each function maps to its OffensiveAction plus the example key holding its variant.
// `inherit` is deliberately absent: it has no action of its own.
const FUNCTION_MAP = {
  shell: ["shell"], command: ["execute"],
  "reverse-shell": ["reverse-shell", "listener"], "bind-shell": ["bind-shell", "connector"],
  "file-write": ["file-write"], "file-read": ["file-read"],
  upload: ["upload", "receiver"], download: ["download", "sender"],
  "library-load": ["injection"], "privilege-escalation": ["privilege-escalation"],
}

const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const strings = (value) => (Array.isArray(value) ? value.map(String) : [])
const text = (value) => (typeof value === "string" ? value : "")
const uniqueSorted = (values) => [...new Set(values)].sort(byCodepoint)
const supplied = (value) => typeof value === "string" && value !== ""
const pick = (arg, env, fallback) => resolve(supplied(arg) ? arg : supplied(process.env[env]) ? process.env[env] : fallback)

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim()
  } catch (error) {
    throw new Error(`git ${args.join(" ")} failed in ${dir}: ${error instanceof Error ? error.message : error}`)
  }
}

function readSource(sourceDir) {
  const registry = load(readFileSync(join(sourceDir, REGISTRY_FILE), "utf8"))
  if (!isRecord(registry)) throw new Error(`${REGISTRY_FILE} is not a mapping of function names`)
  const dir = join(sourceDir, CORPUS_DIR)
  const records = new Map(
    readdirSync(dir)
      .sort(byCodepoint)
      .map((name) => {
        const doc = load(readFileSync(join(dir, name), "utf8"))
        if (!isRecord(doc)) throw new Error(`record ${name} is not a mapping`)
        return [name, doc]
      }),
  )
  return {
    order: Object.keys(registry),
    mitre: new Map(Object.entries(registry).map(([fn, meta]) => [fn, strings(meta?.mitre)])),
    records,
  }
}

function resolveRecord(records, name) {
  const seen = []
  let current = name
  for (;;) {
    const doc = records.get(current)
    if (doc === undefined) throw new Error(`record ${name} references unknown record ${current}`)
    if (typeof doc.alias !== "string") return current
    if (seen.includes(current)) throw new Error(`alias cycle: ${[...seen, current].join(" -> ")}`)
    seen.push(current)
    current = doc.alias
  }
}

function summarize(source, name, memo, stack) {
  const canonical = resolveRecord(source.records, name)
  const cached = memo.get(canonical)
  if (cached !== undefined) return cached
  if (stack.includes(canonical)) throw new Error(`inherit cycle: ${[...stack, canonical].join(" -> ")}`)

  const actions = new Set()
  const mitre = new Set()
  const functions = source.records.get(canonical).functions ?? {}
  for (const fn of source.order) {
    const examples = functions[fn]
    if (!Array.isArray(examples)) continue
    for (const example of examples) {
      if (!isRecord(example)) throw new Error(`${canonical}.${fn} example is not a mapping`)
      const override = Array.isArray(example.mitre) ? strings(example.mitre) : null
      if (fn !== INHERIT) {
        const mapped = FUNCTION_MAP[fn]
        if (mapped === undefined) throw new Error(`record ${canonical} uses unknown function ${fn}`)
        actions.add(mapped[0])
        for (const technique of override ?? source.mitre.get(fn) ?? []) mitre.add(technique)
        continue
      }
      if (typeof example.from !== "string") throw new Error(`${canonical} has an inherit example without "from"`)
      const inherited = summarize(source, example.from, memo, [...stack, canonical])
      for (const action of inherited.actions) actions.add(action)
      for (const technique of override ?? inherited.mitre) mitre.add(technique)
    }
  }

  const result = { actions: uniqueSorted(actions), mitre: uniqueSorted(mitre) }
  memo.set(canonical, result)
  return result
}

function contextNames(contexts) {
  if (!isRecord(contexts)) return []
  const rank = (name) => (CONTEXT_ORDER.includes(name) ? CONTEXT_ORDER.indexOf(name) : CONTEXT_ORDER.length)
  return Object.keys(contexts).sort((a, b) => rank(a) - rank(b) || byCodepoint(a, b))
}

function exampleCode(recordName, fn, example) {
  const own = text(example.code)
  if (own.trim() !== "") return own
  // The schema's coherence rule allows the code to live in every context instead.
  const contexts = isRecord(example.contexts) ? Object.values(example.contexts) : []
  const nested = contexts.find((value) => isRecord(value) && text(value.code).trim() !== "")
  if (isRecord(nested)) return text(nested.code)
  throw new Error(`${recordName}.${fn} example carries no code at the example or context level`)
}

function toCommand(recordName, fn, example) {
  const contexts = contextNames(example.contexts)
  const variantKey = FUNCTION_MAP[fn]?.[1]
  const variant = variantKey === undefined ? undefined : example[variantKey]
  const base = {
    code: exampleCode(recordName, fn, example), description: text(example.comment),
    usecase: fn, category: fn, privileges: contexts.join(","), contexts,
  }
  // `variant` is optional in the contract, so it is omitted rather than nulled.
  return typeof variant === "string" ? { ...base, variant } : base
}

function toPrimitive(name, source, memo) {
  const canonical = resolveRecord(source.records, name)
  const doc = source.records.get(canonical)
  const functions = doc.functions ?? {}
  const commands = []
  const tags = new Set()
  for (const fn of source.order) {
    if (!Array.isArray(functions[fn])) continue
    for (const example of functions[fn]) {
      commands.push(toCommand(canonical, fn, example))
      for (const context of contextNames(example.contexts)) tags.add(context)
    }
  }
  const summary = summarize(source, name, memo, [])
  return {
    source: SOURCE, id: `${SOURCE}:${name}`, binary: name, name,
    description: text(doc.comment), actions: summary.actions,
    platform: [...PLATFORM], mitre: summary.mitre, commands, tags: uniqueSorted(tags),
  }
}

function main() {
  const sourceDir = pick(process.argv[2], "OMC_ARSENAL_SOURCE", DEFAULT_SOURCE_DIR)
  const outputDir = pick(process.argv[3], "OMC_ARSENAL_ROOT", DEFAULT_OUTPUT_DIR)
  const source = readSource(sourceDir)
  const memo = new Map()
  const primitives = [...source.records.keys()].map((name) => toPrimitive(name, source, memo))
  primitives.sort((a, b) => byCodepoint(a.id, b.id))

  const pins = { [SOURCE]: git(sourceDir, ["rev-parse", "HEAD"]) }
  const generatedAt = git(sourceDir, ["show", "-s", "--format=%cI", "HEAD"])
  const corpus = { primitives, pins, generatedAt }

  mkdirSync(outputDir, { recursive: true })
  const corpusPath = join(outputDir, `${SOURCE}.json`)
  const pinPath = join(outputDir, `${SOURCE}.pin.txt`)
  writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`)
  writeFileSync(pinPath, `${pins[SOURCE]}\n`)

  const commands = primitives.reduce((total, primitive) => total + primitive.commands.length, 0)
  process.stdout.write(`${SOURCE}: ${primitives.length} primitives, ${commands} commands, pin ${pins[SOURCE]}\n`)
  process.stdout.write(`wrote ${resolve(corpusPath)}\n`)
  process.stdout.write(`wrote ${resolve(pinPath)}\n`)
}

main()
