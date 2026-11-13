/**
 * Tolerant JSON extraction from model prose, plus the payload contracts that
 * reject a malformed model response instead of writing it into the engagement
 * graph. An autonomous loop that trusts an unvalidated payload corrupts the
 * graph that later steps depend on.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `extract_json_object`,
 * `_extract_first_balanced` and the `_apply_*` / `_classify_*` payload
 * validators in `lib/sapper.py`. See NOTICE.
 */

export class PayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PayloadError"
  }
}

/**
 * Finds the first brace-balanced object that actually parses, tolerating a prose
 * preamble and stray braces inside strings. String and escape aware.
 */
export function extractJsonObject(text: string): unknown | null {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue

    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i += 1) {
      const ch = text[i] as string

      if (inString) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') inString = false
        continue
      }

      if (ch === '"') inString = true
      else if (ch === "{") depth += 1
      else if (ch === "}") {
        depth -= 1
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          try {
            return JSON.parse(candidate)
          } catch {
            break
          }
        }
      }
    }
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export type ReasonDecision = "complete" | "intents" | "noop" | "rejected"

export interface ProposedIntent {
  readonly title: string
  readonly description: string
  readonly from: readonly string[]
}

export interface ReasonPayload {
  readonly decision: ReasonDecision
  readonly intents: readonly ProposedIntent[]
  readonly reason: string | null
}

const MAX_PROPOSED_INTENTS = 3

/**
 * Classifies a commander response. A response that names no valid decision is
 * rejected rather than guessed at, so a malformed reply cannot silently advance
 * the engagement.
 */
export function classifyReasonPayload(raw: unknown, knownFactIds: readonly string[]): ReasonPayload {
  const record = asRecord(raw)
  if (!record) throw new PayloadError("reason payload must be a JSON object")

  const decision = nonEmptyString(record.decision)?.toLowerCase()
  if (decision === "complete") return { decision: "complete", intents: [], reason: null }
  if (decision === "rejected") {
    return { decision: "rejected", intents: [], reason: nonEmptyString(record.reason) }
  }
  if (decision === "noop") {
    return { decision: "noop", intents: [], reason: nonEmptyString(record.reason) }
  }
  if (decision !== "intents") {
    throw new PayloadError(
      `unknown reason decision ${JSON.stringify(record.decision)}; expected complete|intents|noop|rejected`,
    )
  }

  const proposed = Array.isArray(record.intents) ? record.intents : []
  const known = new Set(knownFactIds)
  const valid: ProposedIntent[] = []

  for (const entry of proposed) {
    if (valid.length >= MAX_PROPOSED_INTENTS) break
    const item = asRecord(entry)
    if (!item) continue

    const title = nonEmptyString(item.title)
    const description = nonEmptyString(item.description)
    const from = Array.isArray(item.from)
      ? item.from.filter((id): id is string => typeof id === "string")
      : []

    if (!title || !description || from.length === 0) continue
    if (from.some((id) => id === "goal" || !known.has(id))) continue

    valid.push({ title, description, from })
  }

  if (valid.length === 0) {
    throw new PayloadError("decision was 'intents' but no valid intent was proposed")
  }
  return { decision: "intents", intents: valid, reason: null }
}

export interface ExplorePayload {
  readonly title: string
  readonly description: string
  readonly kind: string | null
  readonly data: Record<string, string>
  readonly doc: string | null
  readonly deviations: string | null
}

export function parseExplorePayload(raw: unknown): ExplorePayload | null {
  const record = asRecord(raw)
  if (!record) return null

  if (record.accepted === false) return null
  const title = nonEmptyString(record.title)
  const description = nonEmptyString(record.description)
  if (!title || !description) return null

  const data: Record<string, string> = {}
  const rawData = asRecord(record.data)
  if (rawData) {
    for (const [key, value] of Object.entries(rawData)) {
      if (value === null || value === undefined) continue
      if (typeof value === "object") continue
      data[key] = String(value)
    }
  }

  return {
    title,
    description,
    kind: nonEmptyString(record.kind),
    data,
    doc: nonEmptyString(record.doc),
    deviations: nonEmptyString(record.deviations),
  }
}

export interface VerifyPayload {
  readonly verified: boolean
  readonly issues: readonly string[]
}

/**
 * A verification must be decisive: `verified: false` needs specific issues, and
 * `verified: true` must carry none, so a vague reply cannot pass as a check.
 */
export function parseVerifyPayload(raw: unknown): VerifyPayload {
  const record = asRecord(raw)
  if (!record) throw new PayloadError("verify payload must be a JSON object")
  if (typeof record.verified !== "boolean") {
    throw new PayloadError("verify payload needs a boolean 'verified'")
  }

  const issues = Array.isArray(record.issues)
    ? record.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    : []

  if (record.verified === false && issues.length === 0) {
    throw new PayloadError("verified=false must name at least one issue")
  }
  if (record.verified === true && issues.length > 0) {
    throw new PayloadError("verified=true must not carry issues")
  }

  return { verified: record.verified, issues }
}
