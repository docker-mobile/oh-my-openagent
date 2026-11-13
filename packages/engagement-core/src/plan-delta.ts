/**
 * Delta subtask planning: a plan is an ordered list of subtasks with stable
 * ids, and a refinement step submits only the operations that change it rather
 * than restating the whole list.
 *
 * A payload is applied as far as it is valid. An operation naming an unknown
 * subtask is reported as rejected instead of thrown, so one bad entry cannot
 * discard the rest of a refinement, and a replayed add or modify is reported as
 * a no-op instead of landing twice.
 *
 * Absorbed from pentagi (MIT, pin cffed9485a) `SubtaskOperation` and
 * `SubtaskPatch` in `backend/pkg/tools/args.go`, and the delta contract in
 * `backend/pkg/templates/prompts/refiner.tmpl`. See NOTICE.
 */

export const SUBTASK_OPS = ["add", "remove", "modify", "reorder"] as const

export type SubtaskOp = (typeof SUBTASK_OPS)[number]

export interface Subtask {
  readonly id: string
  readonly title: string
  readonly description: string
}

/**
 * A validated operation: ids are strings (`after_id` becomes `afterId`) and
 * text is trimmed. For an `add` that carried no id, `id` is the id it landed on.
 */
export interface SubtaskOperation {
  readonly op: SubtaskOp
  readonly id: string | null
  readonly afterId: string | null
  readonly title: string | null
  readonly description: string | null
}

export type SubtaskDeltaRejectionCode =
  | "unknown-op"
  | "missing-id"
  | "missing-title"
  | "unknown-id"
  | "unknown-after-id"
  | "duplicate-id"
  | "self-reference"

export interface SubtaskDeltaRejection {
  readonly code: SubtaskDeltaRejectionCode
  /** The offending element exactly as it arrived. */
  readonly operation: unknown
}

export interface SubtaskDeltaResult {
  /** A new list. The input plan is never mutated; untouched subtasks are shared. */
  readonly plan: readonly Subtask[]
  readonly applied: readonly SubtaskOperation[]
  readonly rejected: readonly SubtaskDeltaRejection[]
  /** Valid operations that would not change the plan, such as a replayed add. */
  readonly unchanged: readonly SubtaskOperation[]
}

const MAX_ID_ATTEMPTS = 64

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function idOf(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null
  return text(value)
}

function isSubtaskOp(value: string | null): value is SubtaskOp {
  return value !== null && (SUBTASK_OPS as readonly string[]).includes(value)
}

function deriveSubtaskId(title: string, description: string): string {
  const seed = `${title}\u0000${description}`
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `s-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

type Anchor = { readonly at: "beginning" } | { readonly at: "after"; readonly id: string }

/** Upstream reads null, the empty id and the number 0 as the head of the list. */
function anchorOf(value: unknown): Anchor | null {
  if (value === null || value === undefined) return { at: "beginning" }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    return value === 0 ? { at: "beginning" } : { at: "after", id: String(value) }
  }
  if (typeof value !== "string") return null
  const id = value.trim()
  return id === "" ? { at: "beginning" } : { at: "after", id }
}

function insertIndex(list: readonly Subtask[], anchor: Anchor): number {
  if (anchor.at === "beginning") return 0
  const index = list.findIndex((entry) => entry.id === anchor.id)
  return index < 0 ? -1 : index + 1
}

type ResolvedAddId =
  | { readonly kind: "new" | "existing"; readonly id: string }
  | { readonly kind: "collision" }

/**
 * The id an `add` lands on. An explicit id that already exists is a replay when
 * the content matches and a collision otherwise; a derived id steps aside for a
 * suffix rather than overwrite a subtask holding different content.
 */
function resolveAddId(
  plan: readonly Subtask[],
  explicit: string | null,
  title: string,
  description: string,
): ResolvedAddId {
  const base = explicit ?? deriveSubtaskId(title, description)

  for (let suffix = 1; suffix <= MAX_ID_ATTEMPTS; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`
    const clash = plan.find((entry) => entry.id === candidate)
    if (clash === undefined) return { kind: "new", id: candidate }
    if (clash.title === title && clash.description === description) return { kind: "existing", id: candidate }
    if (explicit !== null) return { kind: "collision" }
  }

  return { kind: "collision" }
}

/**
 * Applies a delta to a plan without mutating it. Every element is validated on
 * its own, so a payload that is only partly valid still lands the valid part.
 */
export function applySubtaskDelta(plan: readonly Subtask[], delta: readonly unknown[]): SubtaskDeltaResult {
  let current: readonly Subtask[] = [...plan]
  const applied: SubtaskOperation[] = []
  const rejected: SubtaskDeltaRejection[] = []
  const unchanged: SubtaskOperation[] = []

  for (const element of delta) {
    const record = asRecord(element)
    const op = record ? text(record.op) : null
    if (record === null || !isSubtaskOp(op)) {
      rejected.push({ code: "unknown-op", operation: element })
      continue
    }

    const id = idOf(record.id)

    if (op === "add") {
      const title = text(record.title)
      if (title === null) {
        rejected.push({ code: "missing-title", operation: element })
        continue
      }
      const description = text(record.description) ?? ""
      const anchor = anchorOf(record.after_id)
      const at = anchor === null ? -1 : insertIndex(current, anchor)
      if (anchor === null || at < 0) {
        rejected.push({ code: "unknown-after-id", operation: element })
        continue
      }
      const resolved = resolveAddId(current, id, title, description)
      if (resolved.kind === "collision") {
        rejected.push({ code: "duplicate-id", operation: element })
        continue
      }
      const done: SubtaskOperation = {
        op,
        id: resolved.id,
        afterId: anchor.at === "after" ? anchor.id : null,
        title,
        description,
      }
      if (resolved.kind === "existing") {
        unchanged.push(done)
        continue
      }
      current = [...current.slice(0, at), { id: resolved.id, title, description }, ...current.slice(at)]
      applied.push(done)
      continue
    }

    if (id === null) {
      rejected.push({ code: "missing-id", operation: element })
      continue
    }
    const existing = current.find((entry) => entry.id === id)
    if (existing === undefined) {
      rejected.push({ code: "unknown-id", operation: element })
      continue
    }

    if (op === "remove") {
      current = current.filter((entry) => entry.id !== id)
      applied.push({ op, id, afterId: null, title: null, description: null })
      continue
    }

    if (op === "modify") {
      const title = text(record.title) ?? existing.title
      const description = text(record.description) ?? existing.description
      const done: SubtaskOperation = { op, id, afterId: null, title, description }
      if (title === existing.title && description === existing.description) {
        unchanged.push(done)
        continue
      }
      current = current.map((entry) => (entry.id === id ? { id, title, description } : entry))
      applied.push(done)
      continue
    }

    const anchor = anchorOf(record.after_id)
    if (anchor === null) {
      rejected.push({ code: "unknown-after-id", operation: element })
      continue
    }
    if (anchor.at === "after" && anchor.id === id) {
      rejected.push({ code: "self-reference", operation: element })
      continue
    }
    const reduced = current.filter((entry) => entry.id !== id)
    const at = insertIndex(reduced, anchor)
    if (at < 0) {
      rejected.push({ code: "unknown-after-id", operation: element })
      continue
    }
    const next = [...reduced.slice(0, at), existing, ...reduced.slice(at)]
    const done: SubtaskOperation = {
      op,
      id,
      afterId: anchor.at === "after" ? anchor.id : null,
      title: null,
      description: null,
    }
    if (next.map((entry) => entry.id).join("\u0000") === current.map((entry) => entry.id).join("\u0000")) {
      unchanged.push(done)
      continue
    }
    current = next
    applied.push(done)
  }

  return { plan: current, applied, rejected, unchanged }
}
