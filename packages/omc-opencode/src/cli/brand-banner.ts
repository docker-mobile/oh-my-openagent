import { createPalette, isColorEnabled, pickSlogan, renderWordmark, visibleWidth } from "@oh-my-cybersecurity/omc-console-core"

const MIN_BANNER_WIDTH = 52
const FULL_BANNER_WIDTH = 100

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
  const width = options.width ?? process.stdout.columns ?? 100
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
