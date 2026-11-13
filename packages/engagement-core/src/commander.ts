/**
 * Field commander: reduces many concurrent engagements to one compact board, asks
 * which one deserves the next time slice, validates the decision, and acts.
 *
 * A model failure degrades to round-robin instead of stopping the operation, so
 * an unattended run keeps making progress when the planner is unavailable.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `cmd_command`, `_board_summary`,
 * `render_board` and `_parse_command_payload` in `lib/sapper.py`, plus
 * `templates/command.md`. See NOTICE.
 */

import type { EngagementGraph } from "./index"

export const COMMAND_ACTIONS = ["work", "hire", "fire", "stop"] as const
export type CommandAction = (typeof COMMAND_ACTIONS)[number]

const ACTION_MINUTES_CEILING = 240
const ACTION_MINUTES_FLOOR = 1

export class CommanderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CommanderError"
  }
}

export interface BoardRow {
  readonly target: string
  readonly status: "active" | "complete"
  readonly openIntents: number
  readonly flags: number
  readonly captures: Record<string, number>
  readonly workers: readonly string[]
}

export interface EngagementView {
  readonly target: string
  readonly graph: EngagementGraph
  readonly workers?: readonly string[]
}

export function summarizeBoard(engagements: readonly EngagementView[]): BoardRow[] {
  return engagements.map((view) => {
    const graph = view.graph
    return {
      target: view.target,
      status: graph.isComplete() ? "complete" : "active",
      openIntents: graph.frontier().length,
      flags: graph.flags().length,
      captures: graph.intel(),
      workers: [...(view.workers ?? [])],
    }
  })
}

export function renderBoard(rows: readonly BoardRow[]): string {
  if (rows.length === 0) return "(no engagements)"

  return rows
    .map((row) => {
      const workers = row.workers.length > 0 ? row.workers.join(",") : "-"
      const kinds = Object.entries(row.captures)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${kind}:${count}`)
        .join(" ")
      return [row.target, row.status, `w[${workers}]`, `open:${row.openIntents}`, `flags:${row.flags}`, kinds]
        .filter(Boolean)
        .join(" ")
    })
    .join("\n")
}

export interface CommandDecision {
  readonly action: CommandAction
  readonly target: string
  readonly minutes: number
  readonly note: string | null
  readonly degraded: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Validates a planner payload. Minutes are clamped into a sane band rather than
 * trusted, because a bad slice length is how one engagement starves the rest.
 */
export function parseCommandPayload(raw: unknown, knownTargets: readonly string[]): CommandDecision {
  const record = asRecord(raw)
  if (!record) throw new CommanderError("command payload must be a JSON object")

  const action = typeof record.action === "string" ? record.action.trim().toLowerCase() : ""
  if (!(COMMAND_ACTIONS as readonly string[]).includes(action)) {
    throw new CommanderError(
      `unknown action ${JSON.stringify(record.action)}; expected one of: ${COMMAND_ACTIONS.join(", ")}`,
    )
  }

  const target = typeof record.target === "string" ? record.target.trim() : ""
  if (!target) throw new CommanderError("command payload needs a target")
  if (!knownTargets.includes(target)) {
    throw new CommanderError(`unknown target ${JSON.stringify(target)}`)
  }

  const rawMinutes = record.minutes
  const minutes =
    typeof rawMinutes === "number" && Number.isFinite(rawMinutes)
      ? Math.min(Math.max(Math.trunc(rawMinutes), ACTION_MINUTES_FLOOR), ACTION_MINUTES_CEILING)
      : ACTION_MINUTES_FLOOR

  return {
    action: action as CommandAction,
    target,
    minutes,
    note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
    degraded: false,
  }
}

/**
 * Chooses a target round-robin, skipping completed engagements and preferring
 * one that is idle. This is the path taken when the planner is unavailable.
 */
export function roundRobinDecision(
  rows: readonly BoardRow[],
  cursor: number,
  options: { readonly action?: CommandAction; readonly minutes?: number; readonly workers?: readonly string[] } = {},
): CommandDecision | null {
  const ownerOf = options.workers ?? []
  const candidates = rows.filter((row) => row.status === "active")
  if (candidates.length === 0) return null

  const idle = candidates.filter((row) => !row.workers.some((worker) => ownerOf.includes(worker)))
  const pool = idle.length > 0 ? idle : candidates
  const chosen = pool[((cursor % pool.length) + pool.length) % pool.length] as BoardRow

  return {
    action: options.action ?? "work",
    target: chosen.target,
    minutes: options.minutes ?? ACTION_MINUTES_FLOOR,
    note: "planner unavailable; round-robin fallback",
    degraded: true,
  }
}

export interface CommanderInput {
  readonly engagements: readonly EngagementView[]
  readonly cursor?: number
  readonly plan?: (board: string, rows: readonly BoardRow[]) => Promise<unknown> | unknown
}

export interface CommanderResult {
  readonly decision: CommandDecision | null
  readonly board: string
  readonly rows: readonly BoardRow[]
  readonly planError: string | null
}

/**
 * One commander tick: render the board, ask the planner, and fall back to
 * round-robin when the planner throws or returns something invalid. A planner
 * failure is reported, never swallowed, and never stops the operation.
 */
export async function commanderTick(input: CommanderInput): Promise<CommanderResult> {
  const rows = summarizeBoard(input.engagements)
  const board = renderBoard(rows)
  const cursor = input.cursor ?? 0

  if (!input.plan) {
    return { decision: roundRobinDecision(rows, cursor), board, rows, planError: null }
  }

  try {
    const payload = await input.plan(board, rows)
    const decision = parseCommandPayload(payload, rows.map((row) => row.target))
    return { decision, board, rows, planError: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { decision: roundRobinDecision(rows, cursor), board, rows, planError: message }
  }
}
