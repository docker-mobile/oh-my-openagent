/**
 * Tool-call robustness trio for autonomous agent loops: a repeat detector that
 * fingerprints successive calls and names the loop, an argument fixer that
 * salvages the common malformed-JSON shapes a model emits, and a reflector
 * message builder that turns a failed call into a bounded corrective prompt.
 *
 * The three paths are independent: a loop can fire on a syntactically perfect
 * call, and a repair can succeed on a call the loop would have counted. Every
 * path is provider-agnostic on purpose - the only inputs are a tool name, a raw
 * argument payload, and plain-data schema descriptions.
 *
 * Absorbed from pentagi (MIT, checkout /root/omo-cyber/src/pentagi)
 * `repeatingDetector` / `repeatingToolResponse` in
 * `backend/pkg/providers/helpers.go`, the `fixToolCallArgs` retry gate in
 * `backend/pkg/providers/performer.go`, the repair contract of
 * `backend/pkg/templates/prompts/toolcall_fixer.tmpl`, and the
 * `GenerateFromPattern` / `ValidatePattern` sample-infer-validate scheme in
 * `backend/pkg/templates/templates.go`.
 */

import { extractJsonObject } from "./json-extract"

export const REPEAT_THRESHOLD = 3
export const REPEAT_ABORT_THRESHOLD = 7
export const REFLECTOR_MESSAGE_CAP = 2000
export const REPEAT_ECHO_LIMIT = 4096

export interface ToolCallSnapshot {
  readonly name: string
  /** Raw JSON argument payload as the model produced it. */
  readonly args: string
  /**
   * Caller-supplied state token (e.g. a file mtime or result hash). The
   * fingerprint includes it, so a legitimate re-read after a change - same
   * tool, same arguments, different world - is not a repeat.
   */
  readonly stateToken?: string
}

export interface RepeatReport {
  /** Length of the current streak of identical calls, >= 1. */
  readonly count: number
  readonly threshold: number
  readonly repeating: boolean
  /** Set once `repeating`; a corrective notice naming the loop. */
  readonly notice: string | null
  /** Set once `repeating`; the last tool answer worth echoing back. */
  readonly previousResponse: string | null
}

const volatileArgKeys = new Set(["message"])

/**
 * Stable fingerprint of one tool call. Argument objects are canonicalized so
 * key order never decides a repeat; free-form chatter keys are dropped because
 * a model padding the same call with a different apology is still repeating.
 * Unparseable payloads fingerprint the raw string instead.
 */
export function fingerprintToolCall(call: ToolCallSnapshot): string {
  let canonical = call.args
  const parsed = tryParseObject(call.args)
  if (parsed) {
    for (const key of volatileArgKeys) delete parsed[key]
    canonical = JSON.stringify(parsed, sortedReplacer)
  }
  return `${call.name}|${call.stateToken ?? ""}|${canonical}`
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key]
  }
  return sorted
}

/** Incremental repeat detector; call once per executed tool call. */
export class RepeatDetector {
  private lastFingerprint: string | null = null
  private count = 0
  private lastResponse: string | null = null

  /**
   * Records one call and reports the current streak. `response` is what the
   * tool answered this time; the detector hands it back on a repeat instead of
   * replacing it with a bare notice, because the answer is usually the only
   * thing that explains the repetition.
   */
  observe(call: ToolCallSnapshot, response: string): RepeatReport {
    const fp = fingerprintToolCall(call)
    if (fp === this.lastFingerprint) {
      this.count += 1
    } else {
      this.lastFingerprint = fp
      this.count = 1
    }
    if (response.trim().length > 0) this.lastResponse = response

    const repeating = this.count >= REPEAT_THRESHOLD
    return {
      count: this.count,
      threshold: REPEAT_THRESHOLD,
      repeating,
      notice: repeating
        ? repeatNotice(call.name, this.count, this.lastResponse ?? "")
        : null,
      previousResponse: repeating ? (this.lastResponse ?? "") : null,
    }
  }

  /** Whether the streak has crossed the hard abort limit. */
  shouldAbort(): boolean {
    return this.count >= REPEAT_ABORT_THRESHOLD
  }

  reset(): void {
    this.lastFingerprint = null
    this.count = 0
    this.lastResponse = null
  }
}

function repeatNotice(funcName: string, count: number, previous: string): string {
  if (previous.trim() === "") {
    return `tool call '${funcName}' is repeating, please try another tool`
  }
  const echo = previous.slice(0, REPEAT_ECHO_LIMIT)
  return (
    `you have called '${funcName}' with identical arguments ${count} times and it ` +
    `answered the same way each time. Here is that answer again:\n\n${echo}\n\n` +
    "It will not change. Alter the arguments, use a different tool, or answer from what you already have."
  )
}

// ---------------------------------------------------------------------------
// Argument fixer
// ---------------------------------------------------------------------------

export type FixVerdict = "fixed" | "valid" | "unrepairable"

export interface ArgFixResult {
  readonly verdict: FixVerdict
  /** Every applied repair, in order; empty when nothing was changed. */
  readonly changes: readonly string[]
  /** Parsed object when verdict is fixed or valid; null otherwise. */
  readonly value: Record<string, unknown> | null
}

/**
 * Repairs the argument payload of a tool call without ever dropping a key.
 * Repairs: JSON double-encoded as a string, single-quoted keys and values,
 * trailing commas, prose wrapping a JSON object, and unquoted control slop.
 * Anything that would require inventing or removing arguments is unrepairable.
 */
export function fixToolCallArgs(raw: string): ArgFixResult {
  const text = raw.trim()
  if (text === "") return { verdict: "unrepairable", changes: [], value: null }

  const asIs = tryParseObject(text)
  if (asIs) return { verdict: "valid", changes: [], value: asIs }

  // A JSON string whose content is itself a JSON object.
  const changes: string[] = []
  try {
    const once = JSON.parse(text) as unknown
    if (typeof once === "string") {
      const twice = tryParseObject(once)
      if (twice) {
        return { verdict: "fixed", changes: ["decoded a double-encoded JSON string"], value: twice }
      }
    }
  } catch {
    // fall through to structural repairs
  }

  // Prose around a JSON object: reuse the brace-balanced scanner.
  const extracted = extractJsonObject(text)
  if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
    changes.push("extracted the JSON object from surrounding prose")
    return { verdict: "fixed", changes, value: extracted as Record<string, unknown> }
  }

  let current = text
  const quoteFixed = relaxQuotes(current)
  if (quoteFixed.changed) {
    current = quoteFixed.text
    changes.push("converted single-quoted keys and values to double quotes")
  }
  const commaFixed = stripTrailingCommas(current)
  if (commaFixed.changed) {
    current = commaFixed.text
    changes.push("removed trailing commas before a closing brace")
  }

  const repaired = tryParseObject(current)
  if (repaired) {
    return { verdict: "fixed", changes, value: repaired }
  }
  return { verdict: "unrepairable", changes: [], value: null }
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function relaxQuotes(text: string): { text: string; changed: boolean } {
  let out = ""
  let changed = false
  let inSingle = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string
    if (ch === "'") {
      changed = true
      out += inSingle ? '"' : '"'
      inSingle = !inSingle
      continue
    }
    if (!inSingle && ch === '"') {
      // keep double-quoted regions intact, including their escapes
      out += ch
      i += 1
      while (i < text.length) {
        const inner = text[i] as string
        out += inner
        if (inner === "\\") {
          i += 1
          if (i < text.length) out += text[i] as string
        } else if (inner === '"') {
          break
        }
        i += 1
      }
      continue
    }
    out += ch
  }
  if (!changed) return { text, changed: false }
  return { text: out, changed: true }
}

function stripTrailingCommas(text: string): { text: string; changed: boolean } {
  const out = text.replace(/,(\s*[}\]])/g, "$1")
  return { text: out, changed: out !== text }
}

// ---------------------------------------------------------------------------
// Reflector message builder
// ---------------------------------------------------------------------------

export interface ToolSchemaField {
  readonly name: string
  readonly type: string
  readonly required: boolean
}

export interface ToolSchemaShape {
  readonly name: string
  readonly fields: readonly ToolSchemaField[]
}

/**
 * Builds the corrective message the reflector injects after a malformed call:
 * it names the specific violation, the expected shape, and the repair rule,
 * mirroring the toolcall_fixer contract (minimal changes, content integrity,
 * schema-conformant output) without the upstream persona.
 */
export function buildReflectorMessage(input: {
  readonly toolName: string
  readonly rawArgs: string
  readonly error: string
  readonly schema: ToolSchemaShape
  readonly cap?: number
}): string {
  const cap = input.cap ?? REFLECTOR_MESSAGE_CAP
  const violations = detectViolations(input.rawArgs, input.schema)
  const required = input.schema.fields.filter((f) => f.required).map((f) => `${f.name}: ${f.type}`)
  const shape = required.length > 0 ? required.join(", ") : "no required fields"

  const parts = [
    `your call to tool '${input.toolName}' failed and was not executed.`,
    `violation: ${violations.length > 0 ? violations.join("; ") : input.error}`,
    `expected arguments: { ${shape} }`,
    "repair rule: return only the corrected JSON arguments. Make minimal changes, keep every existing argument key, and do not add prose.",
    `execution error: ${input.error}`,
  ]
  const message = parts.join("\n")
  return message.length > cap ? `${message.slice(0, cap)}...[truncated]` : message
}

function detectViolations(raw: string, schema: ToolSchemaShape): string[] {
  const violations: string[] = []
  const text = raw.trim()

  let object = tryParseObject(text)
  if (!object) {
    try {
      const once = JSON.parse(text) as unknown
      object = typeof once === "string" ? tryParseObject(once) : null
      violations.push(
        object === null
          ? "arguments are not valid JSON"
          : "arguments were a JSON string wrapping the object, not the object itself",
      )
    } catch {
      violations.push("arguments are not valid JSON")
    }
  }

  if (object) {
    const missing = schema.fields
      .filter((f) => f.required && !(f.name in object))
      .map((f) => f.name)
    if (missing.length > 0) violations.push(`missing required argument(s): ${missing.join(", ")}`)
  }

  if (violations.length === 0) violations.push("arguments did not satisfy the tool schema")
  return violations
}
