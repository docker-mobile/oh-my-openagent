#!/usr/bin/env node
/**
 * Payload-forge corpus generator. Reads a PayloadsAllTheThings checkout (MIT,
 * Copyright (c) 2019 Swissky) and writes templates.json, wordlists.json and
 * payloads.pin.txt into the data directory.
 *
 * Byte determinism: arrays sort by id, objects use a fixed key order, bodies are
 * copied verbatim, sourcePath stays relative to the source root, and generatedAt
 * is the PIN COMMIT's committer date rather than wall-clock, so a rerun from the
 * same pin leaves the corpus byte-identical instead of dirtying it.
 *
 * The wordlist bodies are NOT written: they total ~2.8 MB, so the index records
 * a sha256 per file for a consumer to verify the file it reads.
 *
 * Usage: node generate-payloads.mjs [sourceDir] [outputDir]
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { basename, extname, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"

const DEFAULT_SOURCE = "/root/omo-cyber/src/PayloadsAllTheThings"
const DEFAULT_OUTPUT = "/root/oh-my-openagent/packages/payload-forge-core/data"
const HOPLA_CONFIG = join(".github", "hopla_config.json")

/**
 * Total category -> PayloadKind mapping, keyed by the lowercased, punctuation-
 * collapsed category name. Unmapped categories resolve to "other", never
 * dropped. Judgement calls recorded so a reader can disagree deliberately:
 *   - RFI -> rce          the included remote file is attacker-controlled code
 *                         the target executes (http://§HOST§/shell.txt).
 *   - XPATH, Misc -> other      no xpath kind exists; Misc is a mixed bucket
 *                         (CRLF, CSV, magic hashes, S3).
 *   - CSTI -> ssti         template injection on the client.
 *   - WebShell, ReverseShell -> rce, Headers -> header.
 */
const CATEGORY_KINDS = new Map([
  ["xss", "xss"],
  ["sqli", "sqli"],
  ["sql injection", "sqli"],
  ["ssrf", "ssrf"],
  ["xpath", "other"],
  ["ldap", "ldap"],
  ["ldap injection", "ldap"],
  ["command injection", "command-injection"],
  ["lfi", "lfi"],
  ["rfi", "rce"],
  ["xxe", "xxe"],
  ["ssti", "ssti"],
  ["server side template injection", "ssti"],
  ["client side template injection", "ssti"],
  ["headers", "header"],
  ["misc", "other"],
  ["graphql", "graphql"],
  ["nosql", "nosql"],
  ["csti", "ssti"],
  ["webshell", "rce"],
  ["reverseshell", "rce"],
  ["open redirect", "open-redirect"],
  ["crlf", "crlf"],
  ["csv injection", "csv-injection"],
  ["wordlist", "wordlist"],
])

function normalizeCategory(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Never returns undefined: an unmapped category is "other", never dropped. */
export function kindForCategory(name) {
  return CATEGORY_KINDS.get(normalizeCategory(name)) ?? "other"
}

export function slug(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function byId(a, b) {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function flattenLeaves(values) {
  const leaves = []
  for (const entry of Array.isArray(values) ? values : []) {
    if (Array.isArray(entry.values)) leaves.push(...flattenLeaves(entry.values))
    else leaves.push(entry)
  }
  return leaves
}

/**
 * Variable names come from the source's own metadata: its `prompt` list plus the
 * `§NAME§` tokens in the body. The source declares no description, so description
 * stays empty - an invented one would be a lie dressed as provenance.
 */
function variableNames(leaf) {
  const names = []
  const add = (raw) => {
    const name = String(raw ?? "").replace(/§/g, "").trim()
    if (name && !names.includes(name)) names.push(name)
  }
  for (const declared of Array.isArray(leaf.prompt) ? leaf.prompt : []) add(declared)
  for (const token of String(leaf.value ?? "").match(/§[^§]*§/g) ?? []) add(token)
  return names
}

/**
 * One template per NAMED payload: an entry with an empty name cannot be addressed
 * by the `pat:<category>:<name>` id contract at all, so those are counted and
 * reported rather than given a fabricated name.
 *
 * A source name that slugs to an id twice (the source repeats a few, e.g. XXE
 * "PHP Wrapper") gets a stable -2/-3 suffix in source order: ids stay unique
 * without renaming the first entry.
 */
export function collectTemplates(config) {
  const templates = []
  const seen = new Map()
  let named = 0
  let unnamed = 0

  for (const category of Array.isArray(config?.categories) ? config.categories : []) {
    const kind = kindForCategory(category.name)
    for (const leaf of flattenLeaves(category.values)) {
      const name = String(leaf.name ?? "")
      if (!slug(name)) {
        unnamed += 1
        continue
      }
      named += 1
      const base = `pat:${slug(category.name)}:${slug(name)}`
      const ordinal = (seen.get(base) ?? 0) + 1
      seen.set(base, ordinal)
      templates.push({
        id: ordinal === 1 ? base : `${base}-${ordinal}`,
        name,
        kind,
        category: String(category.name ?? ""),
        body: String(leaf.value ?? ""),
        variables: variableNames(leaf).map((variable) => ({
          name: variable,
          description: "",
          defaultValue: null,
        })),
        source: "hopla_config.json",
        tags: [String(category.name ?? "").toLowerCase()],
      })
    }
  }

  templates.sort(byId)
  return { templates, named, unnamed }
}

async function walkFiles(directory, collected = []) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((a, b) => (a.name < b.name ? -1 : 1))
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === ".git") continue
      await walkFiles(full, collected)
    } else if (entry.isFile()) {
      collected.push(full)
    }
  }
  return collected
}

/** One entry per Intruder wordlist file; `lines` counts non-empty lines only. */
export async function collectFamilies(sourceDir) {
  const relativePaths = (await walkFiles(sourceDir)).map((file) => ({
    file,
    relative: relative(sourceDir, file).split(sep).join("/"),
  }))

  const families = []
  const ids = new Set()
  for (const { file, relative: relativePath } of relativePaths) {
    if (!/intruder/i.test(relativePath)) continue

    const extension = extname(file)
    const family = basename(file).slice(0, extension ? -extension.length : undefined)
    const id = `wl:${slug(family)}`
    if (ids.has(id)) throw new Error(`wordlist family id collision on ${id} (${relativePath})`)
    ids.add(id)

    const bytes = await readFile(file)
    const text = bytes.toString("utf8")
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0).length

    families.push({
      id,
      family,
      lines,
      sourcePath: relativePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
  }

  families.sort(byId)
  return families
}

function git(sourceDir, args) {
  return execFileSync("git", ["-C", sourceDir, ...args], { encoding: "utf8" }).trim()
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function main() {
  const sourceDir = resolve(process.argv[2] ?? DEFAULT_SOURCE)
  const outputDir = resolve(process.argv[3] ?? DEFAULT_OUTPUT)

  const pin = git(sourceDir, ["rev-parse", "HEAD"])
  // The pinned commit's committer date, normalized to UTC: deterministic, so a
  // rerun from the same pin leaves the corpus byte-identical.
  const generatedAt = new Date(git(sourceDir, ["show", "-s", "--format=%cI", pin])).toISOString()

  const config = JSON.parse(await readFile(join(sourceDir, HOPLA_CONFIG), "utf8"))
  const { templates, named, unnamed } = collectTemplates(config)
  const families = await collectFamilies(sourceDir)

  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, "templates.json"), serialize({ templates, pin, generatedAt }))
  await writeFile(join(outputDir, "wordlists.json"), serialize({ families, pin, generatedAt }))
  await writeFile(join(outputDir, "payloads.pin.txt"), `${pin}\n`)

  process.stdout.write(
    `payload-forge: ${templates.length} templates (${named} named, ${unnamed} unnamed excluded), ` +
      `${families.length} wordlist families, pin ${pin}, generatedAt ${generatedAt}\n`,
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ""
if (import.meta.url === invokedPath) {
  await main()
}
