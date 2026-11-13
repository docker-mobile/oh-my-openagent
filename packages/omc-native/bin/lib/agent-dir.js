import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

/**
 * The one place that answers "where does omc keep engine state".
 *
 * Every omc entry point - the published launcher, `omc doctor`, `omc setup`, and the locally
 * installed launcher - MUST resolve the directory through this module. Each surface previously
 * carried its own default, so the product read three different directories depending on how it
 * was started, and an update that changed one of them looked exactly like erased settings.
 */

/** Env names carrying an explicit agent-state directory, most specific first. */
export const AGENT_DIR_ENV_NAMES = ["OMC_CODING_AGENT_DIR", "SENPI_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR"]

/** Marker proving the legacy flat directory was already inspected; written last. */
export const ADOPTION_MARKER = ".adopted-from-omc-flat"

/**
 * State files carried forward from the legacy flat layout. Deliberately an allowlist of small
 * configuration files: sessions, caches and logs stay where they are, so startup never turns into
 * an unbounded copy.
 */
export const ADOPTED_STATE_FILES = ["settings.json", "auth.json", "models.json", "models-store.json", "mcp.json", "trust.json"]

/** Windows launches carry the runtime home in the environment, which must outrank os.homedir. */
export function runtimeHome(env = process.env) {
  return env.HOME || env.USERPROFILE || homedir()
}

/** Where omc keeps engine state: an explicit override, otherwise the canonical branded location. */
export function canonicalAgentDir(env = process.env, home = runtimeHome(env)) {
  for (const name of AGENT_DIR_ENV_NAMES) {
    const configured = env[name]?.trim()
    if (configured) return resolve(configured)
  }
  return defaultAgentDir(home)
}

export function defaultAgentDir(home) {
  return join(home, ".omc", "agent")
}

/** Pre-unification layout: engine state written directly under the config directory. */
export function legacyFlatAgentDir(home) {
  return join(home, ".omc")
}

/**
 * Owner-only mode for every directory this module creates. The RPC socket host refuses a key
 * directory that is group- or world-writable (`unsafe_key_record`), so an agent directory created
 * with the process umask alone breaks startup on hosts whose umask is 0002 (#12546).
 */
export const AGENT_DIR_MODE = 0o700

function ensureAgentDir(path) {
  mkdirSync(path, { recursive: true, mode: AGENT_DIR_MODE })
}

// The RPC socket host refuses a key directory any other user could write to.
const WRITABLE_BY_OTHERS = 0o022

function isMissing(error) {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")
}

/** The mode the host sees through a symlink, for the remedy only; never used to chmod. */
function followedDirMode(path, io) {
  try {
    const followed = (io.stat ?? statSync)(path)
    return followed.isDirectory() ? followed.mode & 0o7777 : undefined
  } catch {
    return undefined
  }
}

/** @typedef {{ action: "created" | "normalized" | "unchanged" | "left" | "skipped" | "absent", path: string, reason?: string, from?: number, to?: number, symlink?: boolean }} AgentDirPreparation */

/**
 * Makes the agent directory one the RPC socket host accepts before the engine starts (#12546).
 *
 * The engine creates the directory with the process umask when it is missing, so a fresh install
 * on a umask 0002 host gets a group-writable directory; omc creates it owner-only first instead.
 * An existing directory keeps its mode except for the group/world write bits, which are removed
 * only on a real directory this user owns. A symlink is never followed and a directory owned by
 * someone else is left as it is; `agentDirRemedy` then names the fix.
 *
 * @returns {AgentDirPreparation}
 */
export function prepareAgentDir(env = process.env, home = runtimeHome(env), io = {}) {
  const create = io.create ?? true
  const path = canonicalAgentDir(env, home)
  if ((io.platform ?? process.platform) === "win32") return { action: "skipped", path, reason: "win32" }
  let stat
  try {
    stat = (io.lstat ?? lstatSync)(path)
  } catch (error) {
    if (!isMissing(error)) throw error
    if (!create) return { action: "absent", path }
    ensureAgentDir(path)
    return { action: "created", path }
  }
  if (!stat.isDirectory()) {
    return { action: "left", path, reason: "not_directory", from: followedDirMode(path, io), symlink: stat.isSymbolicLink() }
  }
  const uid = io.getuid === undefined ? process.getuid?.() : io.getuid()
  const from = stat.mode & 0o7777
  if (uid !== undefined && stat.uid !== uid) return { action: "left", path, reason: "foreign_owner", from }
  if ((from & WRITABLE_BY_OTHERS) === 0) return { action: "unchanged", path }
  const to = from & ~WRITABLE_BY_OTHERS
  ;(io.chmod ?? chmodSync)(path, to)
  return { action: "normalized", path, from, to }
}

/** The fix to print when `prepareAgentDir` had to leave a directory the host will refuse. */
export function agentDirRemedy(preparation) {
  if (preparation.action !== "left") return undefined
  // The host refuses a symlinked key root whatever the target's mode (senpi-task rpc-host
  // socket-auth), so chmod would not help: the link itself is the problem.
  if (preparation.symlink === true) {
    return `omc: ${preparation.path} is a symlink; the RPC socket host refuses a symlinked agent directory whatever its mode. Fix: replace the symlink with a real directory`
  }
  if (preparation.from === undefined) return undefined
  if ((preparation.from & WRITABLE_BY_OTHERS) === 0) return undefined
  const mode = (preparation.from & 0o777).toString(8)
  return `omc: ${preparation.path} is group/world-writable (${mode}) and was left as it is (${preparation.reason}); the RPC socket host refuses it. Fix: chmod go-w ${preparation.path}`
}

const reportedRemedies = new Set()

/**
 * The entry points' call (#12546), fail-open: a failure is reported and never blocks the command.
 *
 * Before ANY command dispatch the entries call it with `create: false`: verbs that return early
 * (`setup`, `login`/`logout`/`whoami`, `sync`, `account`, `remote`) still get an existing
 * group-writable directory tightened, but a command that writes nothing (a refused `omc login`)
 * must not leave a new directory behind. Right before the engine starts it runs with
 * `create: true`. Each remedy line is printed once per process, however often it is called.
 *
 * @param {{ create?: boolean, report?: (line: string) => void, env?: NodeJS.ProcessEnv }} [options]
 */
export function prepareAgentDirForLaunch(options = {}) {
  const report = options.report ?? ((line) => process.stderr.write(`${line}\n`))
  let preparation
  try {
    preparation = prepareAgentDir(options.env ?? process.env, undefined, { create: options.create ?? true })
  } catch (error) {
    report(`omc: could not prepare the agent directory: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const remedy = agentDirRemedy(preparation)
  if (remedy && !reportedRemedies.has(remedy)) {
    reportedRemedies.add(remedy)
    report(remedy)
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "")
}

function readJsonFile(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    return parsed
  } catch {
    // A hand-edited settings file must never stop the agent from starting; leaving it unparsed
    // also leaves the marker unwritten, so a repaired file is still adopted on a later launch.
    return undefined
  }
}

/** Keys that must never be copied between state objects, whatever a legacy file contains. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"])

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Recursively copies properties the canonical object is missing. Present values are never
 * overwritten: the canonical file is always the newer truth, the flat file only fills its
 * gaps. Objects recurse so partially overlapping subtrees keep their missing leaves; arrays,
 * scalars and nulls never merge element-wise. Returns the number of properties copied and
 * collects the top-level keys that gained additions into `touched`.
 */
function mergeMissing(source, target, touched, owner = null) {
  let copied = 0
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) continue
    const value = source[key]
    const topKey = owner ?? key
    if (!(key in target)) {
      target[key] = value
      touched.add(topKey)
      copied += 1
      continue
    }
    if (isPlainObject(value) && isPlainObject(target[key])) {
      copied += mergeMissing(value, target[key], touched, topKey)
    }
  }
  return copied
}

/**
 * Backfills properties an existing canonical state file is missing. Present values are never
 * overwritten: the canonical file is always the newer truth, the flat file only fills its gaps.
 * Returns the touched top-level keys, or undefined when either side cannot be parsed - leaving
 * the marker unwritten, so a repaired file is still adopted on a later launch.
 */
function backfillJsonObject(source, target) {
  const legacy = readJsonFile(source)
  const current = readJsonFile(target)
  if (!legacy || !current) return undefined

  const touched = new Set()
  if (mergeMissing(legacy, current, touched) === 0) return []

  copyFileSync(target, `${target}.bak-${timestamp()}`)
  writeFileSync(target, `${JSON.stringify(current, null, 2)}\n`)
  return [...touched]
}

/**
 * One-time carry-forward from the legacy flat directory into the canonical one.
 *
 * Unifying the directory would otherwise present itself as one more reset to anyone whose state
 * still lives in the flat layout. Idempotent, never overwrites an existing canonical file or
 * value: when a canonical file already exists its missing entries - at any depth for objects -
 * are merged in instead, so credentials adopted before the runtime created its own files are
 * never dropped. Skipped entirely when the user pinned a directory of their own.
 */
/** @typedef {{ adopted: boolean, copied: string[], backfilled: string[] }} AdoptionResult */

/** @returns {AdoptionResult} */
export function adoptLegacyFlatState(env = process.env, home = runtimeHome(env)) {
  /** @type {AdoptionResult} */
  const result = { adopted: false, copied: [], backfilled: [] }
  const canonical = canonicalAgentDir(env, home)
  if (canonical !== defaultAgentDir(home)) return result

  const flat = legacyFlatAgentDir(home)
  if (!existsSync(flat)) return result
  if (existsSync(join(canonical, ADOPTION_MARKER))) return result

  let parseFailed = false
  for (const file of ADOPTED_STATE_FILES) {
    const source = join(flat, file)
    if (!existsSync(source)) continue
    const target = join(canonical, file)
    if (!existsSync(target)) {
      ensureAgentDir(canonical)
      copyFileSync(source, target)
      result.copied.push(file)
      continue
    }
    const backfilled = backfillJsonObject(source, target)
    if (backfilled === undefined) parseFailed = true
    else if (file === "settings.json") result.backfilled.push(...backfilled)
    else result.backfilled.push(...backfilled.map((key) => `${file}:${key}`))
  }

  result.adopted = result.copied.length > 0 || result.backfilled.length > 0
  if (!parseFailed && (result.adopted || existsSync(canonical))) {
    ensureAgentDir(canonical)
    writeFileSync(join(canonical, ADOPTION_MARKER), `${flat}\n`)
  }
  return result
}
