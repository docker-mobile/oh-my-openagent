import type { Command } from "commander"

import {
  createPalette,
  isColorEnabled,
  loadDefaultArsenalView,
  loadDashboardModel,
  renderDashboard,
} from "@oh-my-cybersecurity/omc-console-core"

const DEFAULT_WIDTH = 120
const DEFAULT_HEIGHT = 32
const MIN_WIDTH = 40
const MIN_HEIGHT = 12
const WATCH_INTERVAL_MS = 1_000
export const HIDE_CURSOR = "\u001b[?25l"
export const SHOW_CURSOR = "\u001b[?25h"
export const CLEAR_FRAME = "\u001b[2J\u001b[1;1H"

export interface DashOptions {
  readonly width?: number
  readonly height?: number
  readonly root?: string
  readonly dataRoot?: string
  readonly json?: boolean
  readonly color?: boolean
  readonly watch?: boolean
  readonly frame?: number
}

interface FrameGeometry {
  readonly width: number
  readonly height: number
}

function resolveGeometry(options: DashOptions): FrameGeometry {
  const columns = process.stdout.columns ?? DEFAULT_WIDTH
  const rows = process.stdout.rows ?? DEFAULT_HEIGHT
  return {
    width: Math.max(MIN_WIDTH, options.width ?? columns),
    height: Math.max(MIN_HEIGHT, options.height ?? rows),
  }
}

async function buildFrame(options: DashOptions, palette = createPalette(false)): Promise<string[]> {
  const geometry = resolveGeometry(options)
  const model = loadDashboardModel({ root: options.root, arsenalDataRoot: options.dataRoot })
  const arsenal = await loadDefaultArsenalView(options.dataRoot)
  return renderDashboard(
    { engagement: model.engagement, arsenal },
    { width: geometry.width, height: geometry.height, palette, sloganSeed: options.frame },
  )
}

/**
 * `omc dash` - one frame by default (the screenshot path), `--watch` to redraw,
 * `--json` for the model. A missing engagement or corpus renders an explicit
 * notice rather than failing, so the command works on a fresh machine.
 */
export async function dash(options: DashOptions = {}): Promise<number> {
  const useColor = options.color === false ? false : isColorEnabled()

  if (options.json === true) {
    const model = loadDashboardModel({ root: options.root, arsenalDataRoot: options.dataRoot })
    const arsenal = await loadDefaultArsenalView(options.dataRoot)
    process.stdout.write(JSON.stringify({ engagement: model.engagement, arsenal }, null, 2) + "\n")
    return 0
  }

  if (options.watch === true) {
    if (process.stdout.isTTY !== true) {
      process.stderr.write("dash --watch needs a TTY; run without --watch for a single frame\n")
      return 2
    }
    let frame = 0
    process.stdout.write(HIDE_CURSOR)
    const stop = (): void => {
      // Restore the cursor but leave the last frame on screen: clearing here would
      // erase the very output a screenshot or a scrolling terminal is meant to keep.
      process.stdout.write(SHOW_CURSOR + "\n")
      process.exit(0)
    }
    process.on("SIGINT", stop)
    process.on("SIGTERM", stop)
    try {
      for (;;) {
        const lines = await buildFrame({ ...options, frame }, createPalette(useColor))
        process.stdout.write(CLEAR_FRAME + lines.join("\n") + "\n")
        frame += 1
        await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS))
      }
    } finally {
      process.stdout.write(SHOW_CURSOR)
    }
  }

  const lines = await buildFrame(options, createPalette(useColor))
  process.stdout.write(lines.join("\n") + "\n")
  return 0
}

export function configureDashCommand(program: Command): void {
  program
    .command("dash")
    .description("Render the offensive console: engagement graph, frontier, and arsenal")
    .option("--width <columns>", "Frame width in columns", (value: string) => Number.parseInt(value, 10))
    .option("--height <rows>", "Frame height in rows", (value: string) => Number.parseInt(value, 10))
    .option("--root <path>", "Engagement store root", ".omc/engagement")
    .option("--data-root <path>", "Arsenal corpus directory (generated from your own clone)")
    .option("--json", "Emit the dashboard model as JSON instead of a frame")
    .option("--no-color", "Disable ANSI color")
    .option("--watch", "Redraw continuously (requires a TTY)")
    .action(async (options: DashOptions) => {
      const exitCode = await dash(options)
      if (options.watch !== true) process.exit(exitCode)
    })
}
