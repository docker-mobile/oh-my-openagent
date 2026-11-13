// Package: @oh-my-cybersecurity/omc-console-core - wordmark geometry tests.

import { describe, expect, test } from "bun:test"
import { createPalette, GLYPHS } from "./palette"
import { renderWordmark, wordmarkWidth } from "./wordmark"

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g")
const COLOR_OFF = createPalette(false)
const COLOR_ON = createPalette(true)
const WIDTHS = [40, 80, 120]
const ESC = String.fromCharCode(27)

function visible(line: string): string {
  return line.replace(ANSI, "")
}

function assertUniformAndBounded(lines: readonly string[], limit: number): void {
  expect(lines.length).toBeGreaterThan(0)
  const widths = new Set(lines.map((line) => visible(line).length))
  expect(widths.size).toBe(1)
  const width = lines[0] === undefined ? 0 : visible(lines[0]).length
  expect(width).toBeLessThanOrEqual(limit)
}

describe("renderWordmark", () => {
  for (const width of WIDTHS) {
    describe(`#given width ${width}`, () => {
      test("#when the full wordmark is rendered #then every line is equal width and within the limit", () => {
        assertUniformAndBounded(renderWordmark({ width, palette: COLOR_OFF }), width)
        assertUniformAndBounded(renderWordmark({ width, palette: COLOR_ON }), width)
      })

      test("#when the compact wordmark is rendered #then every line is equal width and within the limit", () => {
        assertUniformAndBounded(renderWordmark({ width, palette: COLOR_OFF, compact: true }), width)
        assertUniformAndBounded(renderWordmark({ width, palette: COLOR_ON, compact: true }), width)
      })
    })
  }

  test("#given a wide terminal #when the full wordmark is rendered #then it is eight lines at the natural width", () => {
    const lines = renderWordmark({ width: 120, palette: COLOR_OFF })
    expect(lines.length).toBe(8)
    expect(lines.every((line) => line.length === wordmarkWidth())).toBe(true)
    expect(wordmarkWidth()).toBeGreaterThan(0)
  })

  test("#given a wide terminal #when the compact wordmark is rendered #then it is three lines at its natural width", () => {
    const lines = renderWordmark({ width: 120, palette: COLOR_OFF, compact: true })
    expect(lines.length).toBe(3)
    expect(lines.every((line) => line.length === wordmarkWidth(true))).toBe(true)
    expect(wordmarkWidth(true)).toBeLessThan(wordmarkWidth())
  })

  test("#given a narrow terminal #when the full wordmark is clipped #then the left frame edge survives", () => {
    const lines = renderWordmark({ width: 12, palette: COLOR_OFF })
    expect(lines[0]?.startsWith(GLYPHS.tl)).toBe(true)
    expect(lines.every((line) => line.length === 12)).toBe(true)
  })

  test("#given a disabled palette #when rendered #then no ANSI escape reaches the output", () => {
    for (const line of renderWordmark({ width: 120, palette: COLOR_OFF })) {
      expect(line.includes(ESC)).toBe(false)
    }
  })

  test("#given an enabled palette #when rendered #then the visible geometry is unchanged", () => {
    const plain = renderWordmark({ width: 120, palette: COLOR_OFF })
    const colored = renderWordmark({ width: 120, palette: COLOR_ON })
    expect(colored.map(visible)).toEqual(plain)
    expect(colored.map((line) => line.length)).not.toEqual(plain.map((line) => line.length))
    expect(colored.some((line) => line.includes(ESC))).toBe(true)
  })

  test("#given any width #when rendered #then only the frozen glyph set and ASCII appear", () => {
    const allowed = new Set<string>([...Object.values(GLYPHS).join(""), ..." \t"])
    for (const compact of [false, true]) {
      for (const width of [...WIDTHS, 1, 7]) {
        for (const line of renderWordmark({ width, palette: COLOR_OFF, compact })) {
          for (const char of line) {
            if (char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) <= 0x7e) continue
            expect(allowed.has(char)).toBe(true)
          }
        }
      }
    }
  })

  test("#given a width of zero or less #when rendered #then a single column is still produced", () => {
    for (const width of [0, -5]) {
      const lines = renderWordmark({ width, palette: COLOR_OFF })
      expect(lines.every((line) => line.length === 1)).toBe(true)
    }
  })
})

describe("wordmarkWidth", () => {
  test("#given no argument #when the natural width is read #then the full form is measured", () => {
    expect(wordmarkWidth()).toBe(wordmarkWidth(false))
    expect(wordmarkWidth()).toBeGreaterThan(wordmarkWidth(true))
  })
})
