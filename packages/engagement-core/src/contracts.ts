/**
 * Strict output contracts for the three roles an engagement loop drives: the
 * commander (reason), an executor (explore) and a verifier (verify).
 *
 * `./payloads` is the tolerant first pass: it pulls a JSON object out of model
 * prose and refuses what it cannot read. This module is the strict second pass,
 * the one that decides what may be applied. A malformed reply has to cost a
 * refused payload and never a half-written engagement, so a batch of proposed
 * intents keeps the entries it can prove and names every entry it skipped with
 * the reason it was skipped, and a claimed fact or verification is refused
 * unless the payload carries every field a write needs.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `_classify_reason_payload`,
 * `_apply_reason`, `_parse_explore_payload` and `_parse_verify_payload` in
 * `lib/sapper.py`. See NOTICE.
 */

export class ContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContractError"
  }
}

/** The four verdicts a commander reply can carry, and no fifth. */
export type ContractVerdict = "complete" | "intents" | "noop" | "rejected"

/**
 * The reserved fact id standing for the engagement goal. It is not a fact a
 * node file ever holds, so nothing may declare a dependency on it.
 */
export const GOAL_FACT_ID = "goal"

/** A wider batch than this is refused entry by entry rather than truncated. */
export const MAX_REASON_INTENTS = 3

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Templates send `{accepted: true, data: {...}}`, while a payload that was
 * unwrapped before it got here carries its fields at the top level. The inner
 * record wins only when it actually holds the fields being read, so a top-level
 * `data` map of fact values is never mistaken for the envelope body.
 */
function resolveBody(
  payload: Record<string, unknown>,
  holdsFields: (candidate: Record<string, unknown>) => boolean,
): Record<string, unknown> {
  const inner = asRecord(payload.data)
  return inner !== null && holdsFields(inner) ? inner : payload
}

export interface CompletionDirective {
  readonly from: readonly string[]
  readonly description: string
}

export interface ReasonContract {
  readonly verdict: ContractVerdict
  readonly completion: CompletionDirective | null
  /** Proposed intents, still unvalidated; hand them to `applyReasonIntents`. */
  readonly intents: readonly unknown[]
  readonly reason: string | null
}

function readCompletion(value: unknown): CompletionDirective {
  const record = asRecord(value)
  if (!record) throw new ContractError("reason 'complete' must be an object with 'from' and 'description'")

  const rawFrom = record.from
  if (!Array.isArray(rawFrom)) throw new ContractError("reason 'complete' needs a 'from' list of fact ids")

  const from: string[] = []
  for (const entry of rawFrom) {
    const id = nonEmptyText(entry)
    if (id === null) throw new ContractError("reason 'complete' needs a 'from' list of fact ids")
    from.push(id)
  }

  const description = nonEmptyText(record.description)
  if (!description) throw new ContractError("reason 'complete' needs a non-empty 'description'")

  return { from, description }
}

/**
 * Classifies a commander reply as exactly one of complete | intents | noop |
 * rejected. A payload that names no decision is refused rather than defaulted
 * to `noop`, because a reply nobody can read must not look like a reply that
 * found no work.
 */
export function classifyReasonContract(raw: unknown): ReasonContract {
  const payload = asRecord(raw)
  if (!payload) throw new ContractError("reason payload must be a JSON object")

  if (payload.accepted === false) {
    return { verdict: "rejected", completion: null, intents: [], reason: nonEmptyText(payload.reason) }
  }

  const body =
    asRecord(payload.data) ??
    ("complete" in payload || "intents" in payload || "intent" in payload ? payload : null)
  if (!body) {
    throw new ContractError(
      "reason payload names no decision; expected a complete, intents, noop or rejected reply",
    )
  }

  if ("complete" in body) {
    return { verdict: "complete", completion: readCompletion(body.complete), intents: [], reason: null }
  }
  if ("intents" in body) {
    if (!Array.isArray(body.intents)) throw new ContractError("reason intents must be a list")
    return { verdict: "intents", completion: null, intents: body.intents, reason: null }
  }
  return { verdict: "noop", completion: null, intents: [], reason: nonEmptyText(body.reason) }
}

export interface ValidatedIntent {
  /** Null when the payload named no title; the graph derives one from `description`. */
  readonly title: string | null
  readonly description: string
  readonly from: readonly string[]
}

export interface SkippedIntent {
  readonly index: number
  readonly reason: string
}

export interface IntentApplication {
  readonly accepted: readonly ValidatedIntent[]
  readonly rejected: readonly SkippedIntent[]
}

interface IntentRejection {
  readonly reason: string
}

function validateIntent(entry: unknown, known: ReadonlySet<string>): ValidatedIntent | IntentRejection {
  const intent = asRecord(entry)
  if (!intent) return { reason: "intent must be an object" }

  if (!Array.isArray(intent.from) || intent.from.length === 0) {
    return { reason: "intent needs a non-empty 'from' list of fact ids" }
  }

  const from: string[] = []
  for (const entryId of intent.from) {
    const id = nonEmptyText(entryId)
    if (id === null) return { reason: "intent 'from' entries must be non-empty fact ids" }
    if (id === GOAL_FACT_ID) {
      return { reason: `intent must not depend on the reserved goal id "${GOAL_FACT_ID}"` }
    }
    if (!known.has(id)) return { reason: `intent depends on unknown fact id "${id}"` }
    from.push(id)
  }

  const description = nonEmptyText(intent.description)
  if (!description) return { reason: "intent needs a non-empty description" }

  return { title: nonEmptyText(intent.title), description, from }
}

/**
 * Validates every proposed intent and reports the outcome per entry. One
 * unreadable entry never aborts the batch: upstream slices the list to its
 * first three entries and drops the rest silently, while the overflow here is
 * rejected with the cap as its reason so an overrun stays visible.
 */
export function applyReasonIntents(proposed: unknown, knownFactIds: readonly string[]): IntentApplication {
  if (!Array.isArray(proposed)) throw new ContractError("reason intents must be a list")

  const known = new Set(knownFactIds)
  const accepted: ValidatedIntent[] = []
  const rejected: SkippedIntent[] = []

  for (const [index, entry] of proposed.entries()) {
    if (accepted.length >= MAX_REASON_INTENTS) {
      rejected.push({
        index,
        reason: `batch cap reached: at most ${MAX_REASON_INTENTS} intents are accepted in one batch`,
      })
      continue
    }

    const result = validateIntent(entry, known)
    if ("reason" in result) {
      rejected.push({ index, reason: result.reason })
      continue
    }
    accepted.push(result)
  }

  return { accepted, rejected }
}

export interface ExploreFact {
  readonly title: string
  readonly description: string
  readonly kind: string
  readonly data: Readonly<Record<string, string>>
  readonly doc: string
}

function deviationText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function appendDeviations(doc: string, raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return doc

  const lines: string[] = []
  for (const entry of raw) {
    const deviation = asRecord(entry)
    if (!deviation) continue
    const planned = deviationText(deviation.planned)
    const actual = deviationText(deviation.actual)
    const reason = deviationText(deviation.reason)
    lines.push(`- **Planned:** ${planned} -> **Actual:** ${actual} - *Reason:* ${reason}`)
  }

  return lines.length === 0 ? doc : `${doc}\n\n## Deviations\n${lines.join("\n")}`
}

/**
 * Reads an executor fact. Every one of title, description, kind, data and doc
 * is required: a missing field is a rejection, never a null default, because a
 * half-specified fact is one the graph cannot describe later. Deviations are
 * appended to the doc instead of replacing it, so the executor's own account of
 * the work survives alongside its account of what it changed.
 */
export function parseExploreContract(raw: unknown): ExploreFact | null {
  const payload = asRecord(raw)
  if (!payload) return null
  if (payload.accepted === false) return null

  const body = resolveBody(payload, (candidate) => nonEmptyText(candidate.title) !== null)

  const title = nonEmptyText(body.title)
  const description = nonEmptyText(body.description)
  const kind = nonEmptyText(body.kind)
  const doc = nonEmptyText(body.doc)
  const rawData = asRecord(body.data)
  if (!title || !description || !kind || !doc || !rawData) return null

  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawData)) {
    if (value === null || value === undefined || typeof value === "object") continue
    data[key] = String(value)
  }

  return { title, description, kind, data, doc: appendDeviations(doc, body.deviations) }
}

export interface VerificationReport {
  readonly verified: boolean
  readonly issues: readonly string[]
}

function readIssues(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (typeof value === "string") {
    const text = value.trim()
    return text ? [text] : []
  }
  if (!Array.isArray(value)) {
    throw new ContractError("verify payload 'issues' must be a string or a list of strings")
  }

  const issues: string[] = []
  for (const entry of value) {
    const issue = nonEmptyText(entry)
    if (issue) issues.push(issue)
  }
  return issues
}

/**
 * Reads a verifier report. A verification has to be decisive: `verified: false`
 * without an issue is a vague claim and `verified: true` carrying issues
 * contradicts itself, so both are refused rather than reconciled. Upstream
 * carries `issues` as one string and the newer templates send a list; both read.
 */
export function parseVerifyContract(raw: unknown): VerificationReport {
  const payload = asRecord(raw)
  if (!payload) throw new ContractError("verify payload must be a JSON object")

  const body = resolveBody(payload, (candidate) => typeof candidate.verified === "boolean")
  if (typeof body.verified !== "boolean") {
    throw new ContractError("verify payload needs a boolean 'verified'")
  }

  const issues = readIssues(body.issues)
  if (!body.verified && issues.length === 0) {
    throw new ContractError("verified=false must name at least one issue")
  }
  if (body.verified && issues.length > 0) {
    throw new ContractError("verified=true must not carry issues")
  }

  return { verified: body.verified, issues }
}
