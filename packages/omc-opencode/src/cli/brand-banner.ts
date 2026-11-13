import { createPalette, isColorEnabled, pickSlogan, renderWordmark, visibleWidth } from "@oh-my-cybersecurity/omc-console-core"

// An unsized pty reports 0, and `0 ?? fallback` stays 0 (only null/undefined trigger a
// nullish default), which silently suppressed the banner on every terminal that had not
// been resized yet. Treat a non-positive width as unknown instead.
function resolveWidth(explicit?: number): number {
  if (explicit !== undefined && explicit > 0) return explicit
  const columns = process.stdout.columns
  return columns !== undefined && columns > 0 ? columns : DEFAULT_BANNER_WIDTH
}

const MIN_BANNER_WIDTH = 52
const FULL_BANNER_WIDTH = 100
const DEFAULT_BANNER_WIDTH = 100

export interface BannerOptions {
  readonly width?: number
  readonly color?: boolean
  readonly sloganSeed?: number
}

/**
 * The startup banner: wordmark plus the slogan of the day, framed to the terminal.
 * Returns an empty array on a narrow terminal rather than a mangled frame, because
 * a banner that wraps is worse than no banner.
 */
export function renderBanner(options: BannerOptions = {}): string[] {
  const width = resolveWidth(options.width)
  if (width < MIN_BANNER_WIDTH) return []

  const palette = createPalette(options.color === false ? false : isColorEnabled())
  return renderWordmark({ width, palette, compact: width < FULL_BANNER_WIDTH })
}

export function renderBrandHeader(options: BannerOptions = {}): string[] {
  const banner = renderBanner(options)
  if (banner.length === 0) return []

  const palette = createPalette(options.color === false ? false : isColorEnabled())
  const slogan = pickSlogan(options.sloganSeed)
  const width = Math.max(0, ...banner.map((line) => visibleWidth(line)))
  const trimmed = visibleWidth(slogan) > width ? slogan.slice(0, Math.max(0, width - 1)) + "\u2026" : slogan

  return [...banner, palette.muted + trimmed + palette.reset, ""]
}
