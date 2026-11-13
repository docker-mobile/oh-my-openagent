// Package: @oh-my-cybersecurity/omc-console-core - the OmC wordmark in block characters, framed in a box-drawing border.

import { GLYPHS, type Palette } from "./palette"
import { pickSlogan } from "./slogans"

/** Product name as the wordmark sets it. */
export const PRODUCT_NAME = "OmC"

/** Product line printed under the block artwork. */
export const PRODUCT_TAGLINE = "OFFENSIVE AGENT CONSOLE"

/** Options for {@link renderWordmark}. */
export interface WordmarkOptions {
  /** Maximum display width of any returned line, in terminal cells. Narrower values clip the artwork from the right. */
  readonly width: number
  /** The only source of color for the wordmark. */
  readonly palette: Palette
  /** Renders the three-line framed form instead of the full block wordmark. */
  readonly compact?: boolean
}

interface Segment {
  readonly text: string
  readonly color: string
}

type Row = readonly Segment[]

const BLOCK_LINES = [
  "██████        ██████",
  "██  ██        ██",
  "██  ██ ███ ███ ██",
  "██  ██ █ █ █ █ ██",
  "██████ █ █ █ █ ██████",
]

const COMPACT_LABEL = `█ ${PRODUCT_NAME} █`
const COMPACT_TAGLINE = "OFFENSIVE CONSOLE"
const FRAME_PADDING = 2
const BORDER_COLOR = "muted"

/** The wordmark's own slogan is fixed, so the artwork never reflows between invocations. */
const WORDMARK_SLOGAN_SEED = 0

function visibleWidth(row: Row): number {
  return row.reduce((total, segment) => total + segment.text.length, 0)
}

function frame(rows: readonly Row[]): Row[] {
  const inner = Math.max(0, ...rows.map(visibleWidth)) + FRAME_PADDING * 2
  const horizontal = GLYPHS.h.repeat(inner)
  const above: Row = [{ text: GLYPHS.tl + horizontal + GLYPHS.tr, color: BORDER_COLOR }]
  const below: Row = [{ text: GLYPHS.bl + horizontal + GLYPHS.br, color: BORDER_COLOR }]
  const body = rows.map((row): Row => {
    const pad = " ".repeat(inner - FRAME_PADDING * 2 - visibleWidth(row))
    return [
      { text: GLYPHS.v + " ".repeat(FRAME_PADDING), color: BORDER_COLOR },
      ...row,
      { text: pad + " ".repeat(FRAME_PADDING) + GLYPHS.v, color: BORDER_COLOR },
    ]
  })
  return [above, ...body, below]
}

function bodyRows(compact: boolean): Row[] {
  if (compact) {
    return [
      [
        { text: COMPACT_LABEL, color: "brand" },
        { text: ` ${GLYPHS.arrow} `, color: "hot" },
        { text: COMPACT_TAGLINE, color: "muted" },
      ],
    ]
  }
  const tagline = `${PRODUCT_TAGLINE} ${GLYPHS.dot} ${pickSlogan(WORDMARK_SLOGAN_SEED)}`
  return [
    ...BLOCK_LINES.map((line): Row => [{ text: line, color: "brand" }]),
    [
      { text: GLYPHS.arrow, color: "hot" },
      { text: ` ${tagline}`, color: "muted" },
    ],
  ]
}

function buildRows(compact: boolean): Row[] {
  return frame(bodyRows(compact))
}

function clip(row: Row, limit: number): Row {
  const clipped: Segment[] = []
  let remaining = limit
  for (const segment of row) {
    if (remaining <= 0) break
    const text = segment.text.length > remaining ? segment.text.slice(0, remaining) : segment.text
    remaining -= text.length
    clipped.push({ text, color: segment.color })
  }
  return clipped
}

function paint(segment: Segment, palette: Palette): string {
  const color = segment.color === "brand" ? palette.brand : segment.color === "hot" ? palette.hot : segment.color === "muted" ? palette.muted : ""
  return color === "" ? segment.text : color + segment.text + palette.reset
}

/**
 * Renders the wordmark as one array element per line. Every line carries exactly the same display width and none
 * exceeds `width`; widths below the natural width clip the artwork from the right. Color reaches the output only
 * from `palette`, so a disabled palette yields escape-free lines whose `length` is their display width.
 */
export function renderWordmark(options: WordmarkOptions): string[] {
  const { width, palette, compact = false } = options
  const rows = buildRows(compact)
  const natural = Math.max(0, ...rows.map(visibleWidth))
  const target = Math.max(1, Math.min(Math.max(1, width), natural))
  return rows.map((row) => {
    const clipped = clip(row, target)
    const pad = " ".repeat(target - visibleWidth(clipped))
    return clipped.map((segment) => paint(segment, palette)).join("") + pad
  })
}

/** The natural display width of the wordmark, before any clipping. */
export function wordmarkWidth(compact: boolean = false): number {
  return Math.max(0, ...buildRows(compact).map(visibleWidth))
}
