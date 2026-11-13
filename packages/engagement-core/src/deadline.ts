/**
 * Deadline parsing and time-budget rendering. The rendered string is injected
 * into a prompt so the model paces itself, which is why it must always say how
 * much time is left in a form a reader can act on.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `deadline_from_args` and
 * `format_time_budget` in `lib/sapper.py`. See NOTICE.
 */

export class DeadlineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DeadlineError"
  }
}

export interface DeadlineInput {
  readonly deadline?: string
  readonly minutes?: number
  readonly now?: Date
}

const MINUTE_MS = 60_000

/**
 * Resolves a deadline from either an ISO8601 timestamp or a minute count. A
 * timestamp without a timezone is read as local time, matching how an operator
 * writes a wall-clock deadline.
 */
export function deadlineFromInput(input: DeadlineInput): Date {
  const hasDeadline = input.deadline !== undefined && input.deadline.trim() !== ""
  const hasMinutes = input.minutes !== undefined
  const now = input.now ?? new Date()

  if (hasDeadline && hasMinutes) {
    throw new DeadlineError("--deadline and --minutes are mutually exclusive")
  }
  if (!hasDeadline && !hasMinutes) {
    throw new DeadlineError("a deadline or a minute budget is required")
  }

  if (hasMinutes) {
    const minutes = input.minutes as number
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new DeadlineError(`minutes must be a positive number, got ${JSON.stringify(input.minutes)}`)
    }
    return new Date(now.getTime() + minutes * MINUTE_MS)
  }

  const raw = (input.deadline as string).trim()
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new DeadlineError(`invalid deadline ${JSON.stringify(input.deadline)}; expected ISO8601`)
  }
  return parsed
}

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

function formatClock(deadline: Date): string {
  return `${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`
}

/**
 * Renders the budget line. An elapsed deadline says so explicitly rather than
 * reporting a negative duration.
 */
export function formatTimeBudget(deadline: Date, now: Date = new Date()): string {
  const remainingMs = deadline.getTime() - now.getTime()
  if (remainingMs <= 0) {
    return `TIME IS UP: the ${formatClock(deadline)} deadline has passed; stop starting new work and report what is confirmed.`
  }

  const totalMinutes = Math.floor(remainingMs / MINUTE_MS)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const duration = hours > 0 ? `${hours}h${pad(minutes)}m` : `${minutes}m`

  return `${duration} remaining until the ${formatClock(deadline)} deadline`
}

export interface BudgetedPromptInput {
  readonly template: string
  readonly deadline: Date
  readonly now?: Date
}

export function injectTimeBudget(input: BudgetedPromptInput): string {
  const budget = formatTimeBudget(input.deadline, input.now ?? new Date())
  return input.template.split("{time_budget}").join(budget)
}
