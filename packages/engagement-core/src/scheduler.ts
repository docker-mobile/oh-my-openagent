/**
 * Cap-aware scheduler: runs as many units as the concurrency cap allows, keeps
 * the cap saturated as work finishes (backfill), and requeues rather than drops
 * a unit that could not start because the cap was reached.
 *
 * The cap is the whole point: an unattended run that exceeds it either stalls or
 * stamps on its own rate limits, so a refused start must be retried, never lost.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `cmd_bench` (`_run_parallel`)
 * and `cmd_fleet` cap handling in `lib/sapper.py`. See NOTICE.
 */

export class SchedulerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SchedulerError"
  }
}

export interface SchedulerOptions {
  readonly maxConcurrent: number
  readonly maxAttempts?: number
}

export interface ScheduledUnit<Result> {
  readonly id: string
  readonly run: () => Promise<Result>
}

export type UnitOutcome<Result> =
  | { readonly kind: "completed"; readonly id: string; readonly result: Result; readonly attempts: number }
  | { readonly kind: "failed"; readonly id: string; readonly error: string; readonly attempts: number }
  | { readonly kind: "requeued"; readonly id: string; readonly attempts: number }

export interface ScheduleReport<Result> {
  readonly outcomes: readonly UnitOutcome<Result>[]
  readonly peakConcurrency: number
  readonly requeued: number
  readonly maxConcurrentObserved: number
}

export function resolveCap(options: SchedulerOptions): number {
  if (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent < 1) {
    throw new SchedulerError(
      `maxConcurrent must be a positive integer, got ${JSON.stringify(options.maxConcurrent)}`,
    )
  }
  return options.maxConcurrent
}

/**
 * Runs units against the cap. A unit whose `run` throws is retried up to
 * `maxAttempts`; the cap is never exceeded even while retries are pending.
 */
export async function runScheduled<Result>(
  units: readonly ScheduledUnit<Result>[],
  options: SchedulerOptions,
): Promise<ScheduleReport<Result>> {
  const cap = resolveCap(options)
  const maxAttempts = options.maxAttempts ?? 1

  const queue = [...units]
  const outcomes: UnitOutcome<Result>[] = []
  const attempts = new Map<string, number>()
  let running = 0
  let peak = 0
  let requeued = 0

  return await new Promise<ScheduleReport<Result>>((resolve, reject) => {
    let settled = false

    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new SchedulerError(String(error)))
    }

    const pump = (): void => {
      if (settled) return

      while (running < cap && queue.length > 0) {
        const unit = queue.shift() as ScheduledUnit<Result>
        running += 1
        peak = Math.max(peak, running)
        const attempt = (attempts.get(unit.id) ?? 0) + 1
        attempts.set(unit.id, attempt)

        void unit
          .run()
          .then(
            (result) => {
              outcomes.push({ kind: "completed", id: unit.id, result, attempts: attempt })
            },
            (error: unknown) => {
              const message = error instanceof Error ? error.message : String(error)
              if (attempt < maxAttempts) {
                requeued += 1
                queue.push(unit)
                outcomes.push({ kind: "requeued", id: unit.id, attempts: attempt })
              } else {
                outcomes.push({ kind: "failed", id: unit.id, error: message, attempts: attempt })
              }
            },
          )
          .finally(() => {
            running -= 1
            pump()
            if (running === 0 && queue.length === 0) {
              settled = true
              resolve({ outcomes, peakConcurrency: peak, requeued, maxConcurrentObserved: peak })
            }
          })
      }

      if (units.length === 0 && !settled) {
        settled = true
        resolve({ outcomes, peakConcurrency: 0, requeued: 0, maxConcurrentObserved: 0 })
      }
    }

    try {
      pump()
    } catch (error) {
      fail(error)
    }
  })
}

export interface StopConditions {
  readonly noopStreakLimit?: number
  readonly maxIterations?: number
  readonly failureLimit?: number
}

export interface LoopStep {
  readonly changedGraph: boolean
  readonly producedNothing: boolean
  readonly failed: boolean
}

export interface StopDecision {
  readonly stop: boolean
  readonly reason: string | null
}

/**
 * Decides whether an autonomy loop should continue. Stop conditions are checked
 * in severity order so the reported reason names the binding limit, not the
 * first one that happens to be true.
 */
export function shouldStop(
  history: readonly LoopStep[],
  conditions: StopConditions = {},
): StopDecision {
  const noopLimit = conditions.noopStreakLimit ?? 3
  const maxIterations = conditions.maxIterations ?? 100
  const failureLimit = conditions.failureLimit ?? 5

  if (history.length >= maxIterations) {
    return { stop: true, reason: `iteration budget exhausted (${maxIterations})` }
  }

  let failures = 0
  for (const step of history) if (step.failed) failures += 1
  if (failures >= failureLimit) {
    return { stop: true, reason: `failure limit reached (${failures})` }
  }

  let streak = 0
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const step = history[i] as LoopStep
    if (step.producedNothing && !step.changedGraph) streak += 1
    else break
  }
  if (streak >= noopLimit) {
    return { stop: true, reason: `no progress for ${streak} iterations` }
  }

  return { stop: false, reason: null }
}
