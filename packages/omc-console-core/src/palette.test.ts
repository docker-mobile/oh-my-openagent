// Package: @oh-my-cybersecurity/omc-console-core - palette contract tests.

import { describe, expect, test } from "bun:test"
import { createPalette, GLYPHS, isColorEnabled } from "./palette"

const TTY_STREAM = { isTTY: true }
const PIPE_STREAM = { isTTY: undefined }
const ESC = String.fromCharCode(27)
const COLOR_ENV = ["NO_COLOR", "TERM", "OMC_NO_COLOR"] as const

/** Runs with every color opt-out variable removed, then restores exactly what was there. */
function withoutColorEnv(run: () => void): void {
  const saved = COLOR_ENV.map((name) => [name, process.env[name]] as const)
  for (const name of COLOR_ENV) delete process.env[name]
  try {
    run()
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function withEnv(name: string, value: string, run: () => void): void {
  const saved = process.env[name]
  process.env[name] = value
  try {
    run()
  } finally {
    if (saved === undefined) delete process.env[name]
    else process.env[name] = saved
  }
}

describe("isColorEnabled", () => {
  test("#given a stream that is not a TTY #when color is resolved #then it is disabled", () => {
    withoutColorEnv(() => {
      expect(isColorEnabled(PIPE_STREAM)).toBe(false)
      expect(isColorEnabled({})).toBe(false)
      expect(isColorEnabled(undefined)).toBe(false)
    })
  })

  test("#given NO_COLOR set to any value #when color is resolved #then it is disabled", () => {
    withoutColorEnv(() => {
      withEnv("NO_COLOR", "", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
      withEnv("NO_COLOR", "1", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
      withEnv("NO_COLOR", "0", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
      withEnv("NO_COLOR", "false", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
    })
  })

  test("#given TERM=dumb #when color is resolved #then it is disabled", () => {
    withoutColorEnv(() => {
      withEnv("TERM", "dumb", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
    })
  })

  test("#given OMC_NO_COLOR=1 #when color is resolved #then it is disabled", () => {
    withoutColorEnv(() => {
      withEnv("OMC_NO_COLOR", "1", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
    })
  })

  test("#given a TTY and no opt-out variable #when color is resolved #then it is enabled", () => {
    withoutColorEnv(() => {
      expect(isColorEnabled(TTY_STREAM)).toBe(true)
    })
  })

  test("#given NO_COLOR or TERM=dumb beats a TTY #when both are present #then color is disabled", () => {
    withoutColorEnv(() => {
      withEnv("TERM", "dumb", () => {
        withEnv("NO_COLOR", "1", () => expect(isColorEnabled(TTY_STREAM)).toBe(false))
      })
    })
  })
})

describe("createPalette", () => {
  test("#given color disabled #when a palette is created #then every entry is the empty string", () => {
    const palette = createPalette(false)
    for (const [name, value] of Object.entries(palette)) {
      expect(name).toBeTruthy()
      expect(value).toBe("")
    }
    expect(palette.reset).toBe("")
    expect(Object.values(palette).every((value) => value === "")).toBe(true)
  })

  test("#given color enabled #when a palette is created #then every entry is an SGR sequence", () => {
    const palette = createPalette(true)
    for (const [name, value] of Object.entries(palette)) {
      if (name === "reset") continue
      expect(value.startsWith(ESC + "[")).toBe(true)
      expect(value.endsWith("m")).toBe(true)
    }
    expect(palette.reset).toBe(ESC + "[0m")
  })

  test("#given a palette #when entries are compared #then distinct roles carry distinct sequences", () => {
    const palette = createPalette(true)
    expect(new Set(Object.values(palette)).size).toBeGreaterThanOrEqual(6)
    expect(palette.brand).not.toBe(palette.hot)
    expect(palette.crit).not.toBe(palette.high)
  })
})

describe("GLYPHS", () => {
  test("#given the frozen glyph table #when read #then every entry matches the contract code point", () => {
    expect(GLYPHS).toEqual({
      tl: "\u250c",
      tr: "\u2510",
      bl: "\u2514",
      br: "\u2518",
      h: "\u2500",
      v: "\u2502",
      teeL: "\u251c",
      teeR: "\u2524",
      teeT: "\u252c",
      teeB: "\u2534",
      cross: "\u253c",
      bar: "\u2588",
      barLight: "\u2591",
      arrow: "\u25b6",
      dot: "\u2022",
      bullet: "\u25cf",
      skull: "\u2620",
      check: "\u2713",
      cross8: "\u2717",
      warn: "\u25b2",
      pulse: "\u25c9",
    })
  })
})
