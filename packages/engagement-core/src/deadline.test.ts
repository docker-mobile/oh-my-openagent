import { describe, expect, test } from "bun:test"

import {
  DeadlineError,
  deadlineFromInput,
  formatTimeBudget,
  injectTimeBudget,
} from "./deadline"

const NOW = new Date("2026-11-13T10:00:00Z")

describe("deadline input", () => {
  test("#given a minute budget #when resolved #then the deadline is that far ahead", () => {
    const deadline = deadlineFromInput({ minutes: 30, now: NOW })
    expect(deadline.getTime() - NOW.getTime()).toBe(30 * 60_000)
  })

  test("#given an ISO timestamp #when resolved #then it is used directly", () => {
    const deadline = deadlineFromInput({ deadline: "2026-11-13T13:00:00Z", now: NOW })
    expect(deadline.toISOString()).toBe("2026-11-13T13:00:00.000Z")
  })

  test("#given both a deadline and minutes #when resolved #then it is refused as ambiguous", () => {
    expect(() => deadlineFromInput({ deadline: "2026-11-13T13:00:00Z", minutes: 10, now: NOW })).toThrow(DeadlineError)
    expect(() => deadlineFromInput({ deadline: "2026-11-13T13:00:00Z", minutes: 10, now: NOW })).toThrow(/mutually exclusive/)
  })

  test("#given neither #when resolved #then it is refused", () => {
    expect(() => deadlineFromInput({ now: NOW })).toThrow(/deadline or a minute budget is required/)
  })

  test("#given a non-positive minute budget #when resolved #then it is refused", () => {
    expect(() => deadlineFromInput({ minutes: 0, now: NOW })).toThrow(/positive/)
    expect(() => deadlineFromInput({ minutes: -3, now: NOW })).toThrow(DeadlineError)
  })

  test("#given an unparseable deadline #when resolved #then it is refused", () => {
    expect(() => deadlineFromInput({ deadline: "tomorrowish", now: NOW })).toThrow(/invalid deadline/)
  })

  test("#given a blank deadline string and no minutes #when resolved #then it is treated as absent", () => {
    expect(() => deadlineFromInput({ deadline: "   ", now: NOW })).toThrow(/required/)
  })
})

describe("time budget rendering", () => {
  test("#given hours remaining #when rendered #then the duration and clock are both stated", () => {
    const budget = formatTimeBudget(new Date("2026-11-13T13:00:00Z"), NOW)
    expect(budget).toMatch(/remaining until the \d\d:\d\d deadline/)
    expect(budget).toContain("h")
  })

  test("#given under an hour remaining #when rendered #then minutes alone are reported", () => {
    const budget = formatTimeBudget(new Date(NOW.getTime() + 25 * 60_000), NOW)
    expect(budget).toContain("25m remaining")
  })

  test("#given minutes under ten #when rendered #then they are zero-padded in the duration", () => {
    const budget = formatTimeBudget(new Date(NOW.getTime() + 65 * 60_000), NOW)
    expect(budget).toContain("1h05m")
  })

  test("#given an elapsed deadline #when rendered #then it says time is up instead of a negative duration", () => {
    const budget = formatTimeBudget(new Date(NOW.getTime() - 60_000), NOW)
    expect(budget).toContain("TIME IS UP")
    expect(budget).not.toContain("-")
    expect(budget).toMatch(/report what is confirmed/)
  })

  test("#given exactly the deadline instant #when rendered #then it counts as up", () => {
    expect(formatTimeBudget(new Date(NOW.getTime()), NOW)).toContain("TIME IS UP")
  })
})

describe("budget injection", () => {
  test("#given a template with the placeholder #when injected #then the budget replaces it", () => {
    const out = injectTimeBudget({
      template: "You have {time_budget}. Pace yourself.",
      deadline: new Date(NOW.getTime() + 10 * 60_000),
      now: NOW,
    })

    expect(out).toContain("10m remaining")
    expect(out).not.toContain("{time_budget}")
  })

  test("#given several placeholders #when injected #then every one is replaced", () => {
    const out = injectTimeBudget({
      template: "{time_budget} then {time_budget}",
      deadline: new Date(NOW.getTime() + 5 * 60_000),
      now: NOW,
    })

    expect(out.split("{time_budget}")).toHaveLength(1)
  })

  test("#given a template without the placeholder #when injected #then it is unchanged", () => {
    const template = "no placeholder here"
    expect(injectTimeBudget({ template, deadline: NOW, now: NOW })).toBe(template)
  })

  test("#given an elapsed deadline #when injected #then the prompt carries the stop instruction", () => {
    const out = injectTimeBudget({
      template: "Budget: {time_budget}",
      deadline: new Date(NOW.getTime() - 1000),
      now: NOW,
    })

    expect(out).toContain("TIME IS UP")
  })
})
