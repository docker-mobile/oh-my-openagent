// Package: @oh-my-cybersecurity/omc-console-core - the semantic ANSI palette and glyph set every console surface draws with.

/** Box-drawing, block and geometric glyphs. Unicode symbols only, never emoji. */
export const GLYPHS = {
  tl: "\u250c", tr: "\u2510", bl: "\u2514", br: "\u2518",
  h: "\u2500", v: "\u2502",
  teeL: "\u251c", teeR: "\u2524", teeT: "\u252c", teeB: "\u2534", cross: "\u253c",
  bar: "\u2588", barLight: "\u2591",
  arrow: "\u25b6", dot: "\u2022", bullet: "\u25cf", skull: "\u2620",
  check: "\u2713", cross8: "\u2717", warn: "\u25b2", pulse: "\u25c9",
} as const

/** A semantic palette. Every entry resolves to an ANSI SGR sequence, and degrades to an empty string when color is off. */
export interface Palette {
  /** the wordmark - bright white/bold */
  readonly brand: string
  /** offensive accent - bright red */
  readonly hot: string
  /** critical severity - red */
  readonly crit: string
  /** high severity - yellow */
  readonly high: string
  /** medium - cyan */
  readonly med: string
  /** low - dim */
  readonly low: string
  /** neutral - dim */
  readonly info: string
  /** success - green */
  readonly good: string
  /** chrome/borders - dim grey */
  readonly muted: string
  readonly reset: string
}

const ESC = "\u001b["

const DISABLED_PALETTE: Palette = Object.freeze({
  brand: "", hot: "", crit: "", high: "", med: "", low: "", info: "", good: "", muted: "", reset: "",
})

const ENABLED_PALETTE: Palette = Object.freeze({
  brand: `${ESC}1;97m`,
  hot: `${ESC}1;91m`,
  crit: `${ESC}91m`,
  high: `${ESC}93m`,
  med: `${ESC}96m`,
  low: `${ESC}2;37m`,
  info: `${ESC}2;37m`,
  good: `${ESC}92m`,
  muted: `${ESC}2;37m`,
  reset: `${ESC}0m`,
})

/** Resolves the palette for a surface that already decided whether it paints ANSI. */
export function createPalette(enabled: boolean): Palette {
  return enabled ? ENABLED_PALETTE : DISABLED_PALETTE
}

/**
 * Color is opt-out and TTY-only: a redirected stream, NO_COLOR, TERM=dumb or OMC_NO_COLOR=1 all disable it.
 */
export function isColorEnabled(stream: { isTTY?: boolean } | undefined = process.stdout): boolean {
  if (stream === undefined || stream.isTTY !== true) return false
  if (process.env.NO_COLOR !== undefined) return false
  if (process.env.TERM === "dumb") return false
  if (process.env.OMC_NO_COLOR === "1") return false
  return true
}
