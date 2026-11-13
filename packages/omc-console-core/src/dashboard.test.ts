import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createPalette } from "./palette"
import { bar, box, columns, pad, truncate, visibleWidth } from "./render"
import { loadArsenalView, renderDashboard, type DashboardModel } from "./dashboard"

const ON = createPalette(true)
const OFF = createPalette(false)
const ESC = "\u001b"

const roots: string[] = []

function tempRoot(): string {
  const root = join(tmpdir(), `omc-console-${Math.random().toString(36).slice(2)}`)
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function emptyModel(overrides: Partial<DashboardModel["engagement"]> = {}): DashboardModel {
  return {
    engagement: {
      found: true,
      path: ".omc/engagement",
      goal: "own the perimeter",
      status: "active",
      intel: { host: 3, service: 5, vuln: 2, cred: 1 },
      facts: 11,
      intents: 4,
      frontier: [
        { id: "i001", title: "attempt weak credentials on the admin panel", from: [], to: null, toGoal: false, claimedBy: null, createdAt: "2026-11-13T00:00:00Z" },
        { id: "i002", title: "exploit the traversal", from: [], to: null, toGoal: true, claimedBy: null, createdAt: "2026-11-13T00:00:00Z" },
      ],
      ...overrides,
    },
    arsenal: { found: false, dataRoot: "/nowhere", index: null },
  }
}

function maxVisible(lines: readonly string[]): number {
  return Math.max(0, ...lines.map((text) => visibleWidth(text)))
}

describe("ansi-aware measurement", () => {
  test("#given a colored string #when its width is measured #then escapes do not count", () => {
    // given
    const plain = "abcdefghij"
    const colored = `${ON.hot}${plain}${ON.reset}`

    // when
    const plainWidth = visibleWidth(plain)
    const coloredWidth = visibleWidth(colored)

    // then
    expect(colored).toContain(ESC)
    expect(plainWidth).toBe(10)
    expect(coloredWidth).toBe(10)
  })

  test("#given text longer than the budget #when truncated #then no line exceeds it even when colored", () => {
    // given
    const long = `${ON.hot}${"x".repeat(200)}${ON.reset}`

    // when
    const clipped = truncate(long, 40)

    // then
    expect(visibleWidth(clipped)).toBe(40)
  })

  test("#given text shorter than the budget #when padded #then the result is exactly the budget", () => {
    // given
    const text = `${ON.med}short${ON.reset}`

    // when
    const padded = pad(text, 30)

    // then
    expect(visibleWidth(padded)).toBe(30)
    expect(padded.endsWith(" ")).toBe(true)
  })

  test("#given a zero or negative budget #when truncating #then the result is empty rather than an error", () => {
    expect(truncate("anything", 0)).toBe("")
    expect(truncate("anything", -5)).toBe("")
  })
})

describe("frame primitives", () => {
  test("#given a box #when rendered #then every row shares one visible width and uses box glyphs", () => {
    // given
    const lines = ["first", `${ON.hot}second${ON.reset}`, "a much longer third row"]

    // when
    const rows = box("TITLE", lines, 40, ON)

    // then
    expect(new Set(rows.map(visibleWidth)).size).toBe(1)
    expect(rows[0] ?? "").toContain("TITLE")
    expect(rows[0] ?? "").toContain("\u250c")
    expect(rows[rows.length - 1] ?? "").toContain("\u2514")
  })

  test("#given a box #when a line carries color #then it still aligns with an uncolored sibling", () => {
    // given
    const rows = box("T", ["plain text here", `${ON.crit}plain text here${ON.reset}`], 30, ON)

    // when
    const widths = rows.map(visibleWidth)

    // then
    expect(new Set(widths).size).toBe(1)
  })

  test("#given a meter #when value is zero #then every cell is the light glyph", () => {
    // given
    const atZero = bar(0, 10, 8, ON)

    // when
    const rendered = visibleWidth(atZero)

    // then
    expect(atZero).toContain("\u2591")
    expect(atZero).not.toContain("\u2588")
    expect(rendered).toBe(8)
  })

  test("#given a meter #when value reaches max #then every cell is filled", () => {
    // given
    const full = bar(10, 10, 8, ON)

    // when
    const rendered = visibleWidth(full)

    // then
    expect(full).toContain("\u2588")
    expect(full).not.toContain("\u2591")
    expect(rendered).toBe(8)
  })

  test("#given an empty denominator #when drawing a meter #then it renders empty instead of dividing by zero", () => {
    // given
    const none = bar(5, 0, 6, ON)

    // when
    const width = visibleWidth(none)

    // then
    expect(width).toBe(6)
    expect(none).not.toContain("NaN")
  })

  test("#given panels of unequal height #when laid out in columns #then rows share one width", () => {
    // given
    const tall = ["aaaa", "bbbb", "cccc"]
    const short = ["dddd"]

    // when
    const rows = columns([tall, short], 40, 2)

    // then
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map(visibleWidth)).size).toBe(1)
  })

  test("#given a disabled palette #when drawing a box #then the output carries no escape byte", () => {
    // given
    const rows = box("TITLE", ["content"], 24, OFF)

    // when
    const joined = rows.join("\n")

    // then
    expect(joined).not.toContain(ESC)
    expect(new Set(rows.map((row) => row.length)).size).toBe(1)
  })
})

describe("dashboard frame", () => {
  test("#given a model #when rendered at several geometries #then no line exceeds the requested width", () => {
    // given
    const model = emptyModel()

    // when
    const frames = [
      renderDashboard(model, { width: 40, height: 20, palette: ON, sloganSeed: 1 }),
      renderDashboard(model, { width: 80, height: 24, palette: ON, sloganSeed: 1 }),
      renderDashboard(model, { width: 120, height: 32, palette: ON, sloganSeed: 1 }),
    ]

    // then
    for (const [index, frame] of frames.entries()) {
      const limit = [40, 80, 120][index] ?? 120
      expect(maxVisible(frame)).toBeLessThanOrEqual(limit)
    }
  })

  test("#given the same model and options #when rendered twice #then the output is byte-identical", () => {
    // given
    const model = emptyModel()
    const options = { width: 100, height: 30, palette: ON, sloganSeed: 7 }

    // when
    const first = renderDashboard(model, options).join("\n")
    const second = renderDashboard(model, options).join("\n")

    // then
    expect(first).toBe(second)
  })

  test("#given a missing engagement #when rendered #then it names the path and still produces a frame", () => {
    // given
    const model = emptyModel({ found: false, path: ".omc/engagement", goal: "", facts: 0, intents: 0, intel: {}, frontier: [] })

    // when
    const frame = renderDashboard(model, { width: 100, height: 30, palette: ON, sloganSeed: 2 }).join("\n")

    // then
    expect(frame).toContain(".omc/engagement")
    expect(frame).toContain("ENGAGEMENT")
  })

  test("#given a clear frontier #when rendered #then the panel says so instead of rendering blank", () => {
    // given
    const model = emptyModel({ frontier: [] })

    // when
    const frame = renderDashboard(model, { width: 100, height: 30, palette: ON, sloganSeed: 3 }).join("\n")

    // then
    expect(frame).toContain("frontier is clear")
  })

  test("#given a disabled palette #when rendered #then the frame is escape-free and measurable by length", () => {
    // given
    const model = emptyModel()

    // when
    const frame = renderDashboard(model, { width: 90, height: 28, palette: OFF, sloganSeed: 4 })

    // then
    expect(frame.join("\n")).not.toContain(ESC)
    expect(maxVisible(frame)).toBeLessThanOrEqual(90)
  })
})

describe("arsenal view", () => {
  test("#given no corpus on disk #when loaded #then it reports absent instead of throwing", async () => {
    // given
    const missing = join(tempRoot(), "definitely-absent")

    // when
    const view = await loadArsenalView(missing)

    // then
    expect(view.found).toBe(false)
    expect(view.index).toBeNull()
    expect(view.dataRoot).toBe(missing)
  })

  test("#given a malformed index #when loaded #then it reports absent instead of throwing", async () => {
    // given
    const root = tempRoot()
    writeFileSync(join(root, "index.json"), JSON.stringify({ nope: true }), "utf-8")

    // when
    const view = await loadArsenalView(root)

    // then
    expect(view.found).toBe(false)
  })

  test("#given a valid index #when loaded #then counts and pins are exposed", async () => {
    // given
    const root = tempRoot()
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        sources: { gtfobins: 478, lolbas: 248 },
        upstreamPins: { gtfobins: "acd524623f9c406acedd2754ebd9c2431f3675ad", lolbas: "2056cb7662509dc998fc6ce79636aec4e6c0397f" },
        generatedAt: "2026-11-13T00:00:00Z",
      }),
      "utf-8",
    )

    // when
    const view = await loadArsenalView(root)

    // then
    expect(view.found).toBe(true)
    expect(view.index?.sources.gtfobins).toBe(478)
    expect(view.index?.upstreamPins.lolbas).toBe("2056cb7662509dc998fc6ce79636aec4e6c0397f")
  })

  test("#given a populated arsenal #when rendered #then each source and pin reaches the frame", async () => {
    // given
    const root = tempRoot()
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        sources: { gtfobins: 478, lolbas: 248 },
        upstreamPins: { gtfobins: "acd524623f9c406acedd2754ebd9c2431f3675ad", lolbas: "2056cb7662509dc998fc6ce79636aec4e6c0397f" },
        generatedAt: "2026-11-13T00:00:00Z",
      }),
      "utf-8",
    )
    const arsenal = await loadArsenalView(root)

    // when
    const frame = renderDashboard({ ...emptyModel(), arsenal }, { width: 100, height: 30, palette: ON, sloganSeed: 5 }).join("\n")

    // then
    expect(frame).toContain("gtfobins")
    expect(frame).toContain("478")
    expect(frame).toContain("acd524623f")
  })
})
