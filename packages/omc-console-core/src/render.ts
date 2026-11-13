// Package: @oh-my-cybersecurity/omc-console-core - width-correct text layout for the console frame.

import { GLYPHS, type Palette } from "./palette"

// A span carries its markup and its visible size separately, so an escape
// sequence can never inflate a measurement.
export interface Span {
  readonly text: string
  readonly color: keyof Palette | null
}

const SGR_RE = /\u001b\[[0-9;]*m/g

/**
 * Display width of a string that may already carry SGR escapes. This is the
 * measurement everything else trusts: `String.length` counts escape bytes, so a
 * colored row and a plain row of equal visible width would disagree and the
 * frame would shear.
 */
export function visibleWidth(text: string): number {
  return text.replace(SGR_RE, "").length
}

export function truncate(text: string, limit: number): string {
  if (limit <= 0) return ""
  if (visibleWidth(text) <= limit) return text

  let kept = 0
  let out = ""
  let index = 0
  while (index < text.length && kept < limit) {
    const match = SGR_RE.exec(text)
    SGR_RE.lastIndex = 0
    if (match !== null && match.index === index) {
      out += match[0]
      index += match[0].length
      continue
    }
    out += text[index]
    index += 1
    kept += 1
  }
  return out
}

export function pad(text: string, width: number): string {
  const clipped = truncate(text, width)
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)))
}

function paint(span: Span, palette: Palette): string {
  if (span.color === null) return span.text
  const color = palette[span.color]
  return color === "" ? span.text : color + span.text + palette.reset
}

export function box(title: string, lines: readonly string[], width: number, palette: Palette): string[] {
  const inner = Math.max(0, width - 2)
  const label = ` ${truncate(title, Math.max(0, inner - 2))} `
  const topFill = Math.max(0, inner - visibleWidth(label))
  const top = palette.muted + GLYPHS.tl + label + GLYPHS.h.repeat(topFill) + GLYPHS.tr + palette.reset
  const bottom = palette.muted + GLYPHS.bl + GLYPHS.h.repeat(inner) + GLYPHS.br + palette.reset

  const body = lines.map((text) => {
    const content = pad(text, inner)
    return palette.muted + GLYPHS.v + palette.reset + content + palette.muted + GLYPHS.v + palette.reset
  })

  return [top, ...body, bottom]
}

const EMPTY_MAX = 0
export function bar(value: number, max: number, width: number, palette: Palette): string {
  const safeWidth = Math.max(0, width)
  if (max <= EMPTY_MAX) return palette.muted + GLYPHS.barLight.repeat(safeWidth) + palette.reset

  const ratio = Math.max(0, Math.min(1, value / max))
  const filled = Math.round(ratio * safeWidth)
  return palette.hot + GLYPHS.bar.repeat(filled) + palette.muted + GLYPHS.barLight.repeat(safeWidth - filled) + palette.reset
}

export function columns(panels: readonly (readonly string[])[], width: number, gap: number): string[] {
  if (panels.length === 0) return []
  const each = Math.floor((width - gap * (panels.length - 1)) / panels.length)
  const height = Math.max(0, ...panels.map((panel) => panel.length))
  const spacer = " ".repeat(gap)

  const rows: string[] = []
  for (let row = 0; row < height; row += 1) {
    rows.push(panels.map((panel) => pad(panel[row] ?? "", each)).join(spacer))
  }
  return rows
}

export function line(spans: readonly Span[], palette: Palette): string {
  return spans.map((span) => paint(span, palette)).join("")
}
