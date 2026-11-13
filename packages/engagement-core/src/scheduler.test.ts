import { describe, expect, test } from "bun:test"

import {
  SchedulerError,
  resolveCap,
  runScheduled,
  shouldStop,
  type LoopStep,
  type ScheduledUnit,
} from "./scheduler"

function unit<T>(id: string, run: () => Promise<T>): ScheduledUnit<T> {
  return { id, run }
}

describe("cap resolution", () => {
  test("#given a positive integer cap #when resolved #then it is used", () => {
    expect(resolveCap({ maxConcurrent: 3 })).toBe(3)
  })

  test("#given a zero or negative cap #when resolved #then it is refused", () => {
    expect(() => resolveCap({ maxConcurrent: 0 })).toThrow(SchedulerError)
    expect(() => resolveCap({ maxConcurrent: -1 })).toThrow(/positive integer/)
  })

  test("#given a fractional cap #when resolved #then it is refused", () => {
    expect(() => resolveCap({ maxConcurrent: 1.5 })).toThrow(SchedulerError)
  })
})

describe("cap-aware scheduling", () => {
  test("#given units within the cap #when run #then all complete", async () => {
    const report = await runScheduled([unit("a", async () => 1), unit("b", async () => 2)], {
      maxConcurrent: 2,
    })

    expect(report.outcomes).toHaveLength(2)
    expect(report.outcomes.every((o) => o.kind === "completed")).toBe(true)
  })

  test("#given more units than the cap #when run #then the cap is never exceeded", async () => {
    let active = 0
    let peak = 0

    const units = Array.from({ length: 8 }, (_, i) =>
      unit(`u${i}`, async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return i
      }),
    )

    const report = await runScheduled(units, { maxConcurrent: 2 })

    expect(peak).toBeLessThanOrEqual(2)
    expect(report.peakConcurrency).toBeLessThanOrEqual(2)
    expect(report.outcomes).toHaveLength(8)
  })

  test("#given a failing unit #when attempts remain #then it is requeued rather than dropped", async () => {
    let calls = 0
    const flaky = unit("flaky", async () => {
      calls += 1
      if (calls === 1) throw new Error("transient")
      return "recovered"
    })

    const report = await runScheduled([flaky], { maxConcurrent: 1, maxAttempts: 2 })

    expect(report.requeued).toBe(1)
    expect(report.outcomes.some((o) => o.kind === "requeued")).toBe(true)
    expect(report.outcomes.some((o) => o.kind === "completed")).toBe(true)
  })

  test("#given a unit that always fails #when attempts are exhausted #then it is reported failed with the error", async () => {
    const report = await runScheduled([unit("bad", async () => { throw new Error("permanent") })], {
      maxConcurrent: 1,
      maxAttempts: 2,
    })

    const failed = report.outcomes.find((o) => o.kind === "failed")
    expect(failed).toBeDefined()
    if (failed?.kind !== "failed") throw new Error("expected a failure outcome")
    expect(failed.error).toBe("permanent")
    expect(failed.attempts).toBe(2)
  })

  test("#given no units #when run #then it resolves empty instead of hanging", async () => {
    const report = await runScheduled([], { maxConcurrent: 3 })

    expect(report.outcomes).toEqual([])
    expect(report.peakConcurrency).toBe(0)
  })

  test("#given an invalid cap #when run #then it rejects rather than starting work", async () => {
    await expect(runScheduled([unit("a", async () => 1)], { maxConcurrent: 0 })).rejects.toThrow(SchedulerError)
  })

  test("#given a retry pending #when other work waits #then the cap still bounds concurrency", async () => {
    let active = 0
    let peak = 0
    let attempts = 0

    const units = [
      unit("retry", async () => {
        attempts += 1
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        if (attempts === 1) throw new Error("again")
        return "ok"
      }),
      unit("other", async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return "ok"
      }),
    ]

    await runScheduled(units, { maxConcurrent: 1, maxAttempts: 2 })
    expect(peak).toBe(1)
  })
})

describe("loop stop conditions", () => {
  const productive: LoopStep = { changedGraph: true, producedNothing: false, failed: false }
  const noop: LoopStep = { changedGraph: false, producedNothing: true, failed: false }
  const failed: LoopStep = { changedGraph: false, producedNothing: true, failed: true }

  test("#given productive work #when checked #then the loop continues", () => {
    expect(shouldStop([productive, productive]).stop).toBe(false)
  })

  test("#given a noop streak at the limit #when checked #then the loop stops naming the streak", () => {
    const decision = shouldStop([noop, noop, noop], { noopStreakLimit: 3 })

    expect(decision.stop).toBe(true)
    expect(decision.reason).toMatch(/no progress/)
  })

  test("#given progress inside the noop window #when checked #then the streak is broken", () => {
    expect(shouldStop([noop, noop, productive, noop, noop], { noopStreakLimit: 3 }).stop).toBe(false)
  })

  test("#given the iteration budget reached #when checked #then the loop stops naming the budget", () => {
    const history = Array.from({ length: 4 }, () => productive)
    const decision = shouldStop(history, { maxIterations: 4 })

    expect(decision.stop).toBe(true)
    expect(decision.reason).toMatch(/iteration budget/)
  })

  test("#given failures at the limit #when checked #then the loop stops naming failures", () => {
    const decision = shouldStop([failed, failed], { failureLimit: 2 })

    expect(decision.stop).toBe(true)
    expect(decision.reason).toMatch(/failure limit/)
  })

  test("#given several limits exceeded at once #when checked #then the more severe reason is reported", () => {
    const history = Array.from({ length: 6 }, () => failed)
    const decision = shouldStop(history, { maxIterations: 6, failureLimit: 2, noopStreakLimit: 1 })

    expect(decision.reason).toMatch(/iteration budget/)
  })

  test("#given no history #when checked #then the loop continues", () => {
    expect(shouldStop([]).stop).toBe(false)
    expect(shouldStop([]).reason).toBeNull()
  })
})
