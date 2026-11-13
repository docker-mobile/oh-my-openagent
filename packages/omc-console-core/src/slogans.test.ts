// Package: @oh-my-cybersecurity/omc-console-core - slogan selection tests.

import { describe, expect, test } from "bun:test"
import { pickSlogan, SLOGANS } from "./slogans"

const DAY_MS = 86_400_000

describe("SLOGANS", () => {
  test("#given the slogan corpus #when counted #then it holds at least twelve lines", () => {
    expect(SLOGANS.length).toBeGreaterThanOrEqual(12)
  })

  test("#given the slogan corpus #when inspected #then every line is non-empty and unique", () => {
    expect(SLOGANS.every((line) => line.trim().length > 0)).toBe(true)
    expect(new Set(SLOGANS).size).toBe(SLOGANS.length)
  })
})

describe("pickSlogan", () => {
  test("#given a fixed seed #when picked repeatedly #then the same line comes back", () => {
    for (const seed of [0, 1, 3, 7, 42, 1_000_003]) {
      const first = pickSlogan(seed)
      expect(pickSlogan(seed)).toBe(first)
      expect(SLOGANS).toContain(first)
    }
  })

  test("#given consecutive seeds #when picked #then each seed reaches its own line", () => {
    const picked = SLOGANS.map((_, index) => pickSlogan(index))
    expect(picked).toEqual([...SLOGANS])
    expect(new Set(picked).size).toBe(SLOGANS.length)
  })

  test("#given a negative seed #when picked #then the index wraps instead of falling off the corpus", () => {
    expect(pickSlogan(-1)).toBe(SLOGANS[SLOGANS.length - 1] as string)
    expect(pickSlogan(-(SLOGANS.length + 2))).toBe(SLOGANS[SLOGANS.length - 2] as string)
    expect(SLOGANS).toContain(pickSlogan(-97))
  })

  test("#given a fractional seed #when picked #then it truncates toward zero", () => {
    expect(pickSlogan(4.9)).toBe(pickSlogan(4))
    expect(pickSlogan(-4.9)).toBe(pickSlogan(-4))
  })

  test("#given no seed #when picked twice within one UTC day #then the line is stable", () => {
    const noon = new Date(Date.UTC(2026, 10, 13, 12, 0, 0))
    const lateEvening = new Date(Date.UTC(2026, 10, 13, 23, 59, 59))
    const first = pickSlogan(undefined, noon)
    expect(pickSlogan(undefined, noon)).toBe(first)
    expect(pickSlogan(undefined, lateEvening)).toBe(first)
    expect(SLOGANS).toContain(first)
  })

  test("#given no seed #when picked #then the index follows the UTC day number", () => {
    const moment = new Date(Date.UTC(2026, 10, 13, 12, 0, 0))
    const dayIndex = Math.floor(moment.getTime() / DAY_MS)
    const expected = SLOGANS[((dayIndex % SLOGANS.length) + SLOGANS.length) % SLOGANS.length] as string
    expect(pickSlogan(undefined, moment)).toBe(expected)
  })

  test("#given no seed #when two different UTC days are walked #then each day resolves deterministically", () => {
    const start = new Date(Date.UTC(2026, 10, 13, 12, 0, 0))
    for (let offset = 0; offset < 40; offset += 1) {
      const day = new Date(start.getTime() + offset * DAY_MS)
      const picked = pickSlogan(undefined, day)
      expect(SLOGANS).toContain(picked)
      expect(pickSlogan(undefined, day)).toBe(picked)
    }
  })
})
