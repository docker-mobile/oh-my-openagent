// Package: @oh-my-cybersecurity/omc-console-core - the offensive console frame over a real engagement and arsenal.

import { join } from "node:path"

import { ARSENAL_SOURCES, type ArsenalIndex } from "@oh-my-cybersecurity/arsenal-core"
import { indexFilePath, loadIndex, resolveDataRoot } from "@oh-my-cybersecurity/arsenal-core/loader"
import { EngagementStore } from "@oh-my-cybersecurity/engagement-core/store"
import { GraphError, type FactKind, type IntentRecord } from "@oh-my-cybersecurity/engagement-core"
import { createPalette, isColorEnabled, type Palette } from "./palette"
import { bar, box, columns, pad, truncate, visibleWidth } from "./render"
import { pickSlogan } from "./slogans"
import { renderWordmark, wordmarkWidth } from "./wordmark"

export interface EngagementView {
  readonly found: boolean
  readonly path: string
  readonly goal: string
  readonly status: string
  readonly intel: Readonly<Partial<Record<FactKind, number>>>
  readonly facts: number
  readonly intents: number
  readonly frontier: readonly IntentRecord[]
}

export interface ArsenalView {
  readonly found: boolean
  readonly dataRoot: string
  readonly index: ArsenalIndex | null
}

export interface DashboardModel {
  readonly engagement: EngagementView
  readonly arsenal: ArsenalView
}

export interface DashboardOptions {
  readonly width: number
  readonly height: number
  readonly palette: Palette
  readonly sloganSeed?: number
  readonly generatedAt?: string
}

export interface LoadOptions {
  readonly cwd?: string
  readonly root?: string
  readonly arsenalDataRoot?: string
}

const DEFAULT_ROOT = ".omc/engagement"
const FACT_ORDER: readonly FactKind[] = ["host", "service", "cred", "vuln", "loot", "flag", "note"]

export function loadDashboardModel(options: LoadOptions = {}): DashboardModel {
  const storePath = options.root ?? DEFAULT_ROOT
  const cwd = options.cwd ?? process.cwd()
  const arsenalDataRoot = options.arsenalDataRoot ?? resolveDataRoot()

  let engagement: EngagementView
  try {
    const store = new EngagementStore({ root: join(cwd, storePath) })
    const snap = store.snapshot()
    const graph = store.load()
    const intel = graph.intel()
    engagement = {
      found: true,
      path: storePath,
      goal: snap.goal,
      status: snap.status,
      intel,
      facts: snap.facts.length,
      intents: snap.intents.length,
      frontier: graph.frontier().map((intent) => ({
        id: intent.id,
        title: intent.title,
        from: [],
        to: intent.to,
        toGoal: intent.toGoal,
        claimedBy: intent.claimedBy,
        createdAt: intent.createdAt,
      })),
    }
  } catch (error) {
    engagement = {
      found: false,
      path: storePath,
      goal: "",
      status: error instanceof GraphError ? error.message : "unreadable",
      intel: {},
      facts: 0,
      intents: 0,
      frontier: [],
    }
  }

  return { engagement, arsenal: { found: false, dataRoot: arsenalDataRoot, index: null } }
}

/** Resolves the corpus directory the dashboard reads, honoring an explicit override. */
export function resolveArsenalDataRoot(explicit?: string): string {
  return resolveDataRoot(explicit)
}

export function arsenalIndexPath(dataRoot: string): string {
  return indexFilePath(dataRoot)
}

export async function loadArsenalView(dataRoot: string): Promise<ArsenalView> {
  try {
    return { found: true, dataRoot, index: await loadIndex(dataRoot) }
  } catch {
    return { found: false, dataRoot, index: null }
  }
}

/** Loads the arsenal view from the resolved root when no explicit path is given. */
export async function loadDefaultArsenalView(explicit?: string): Promise<ArsenalView> {
  return loadArsenalView(resolveArsenalDataRoot(explicit))
}

function engagementPanel(view: EngagementView, inner: number, palette: Palette): string[] {
  if (!view.found) {
    return [
      palette.high + `no engagement at ${view.path}` + palette.reset,
      palette.low + "run: omc-engagement init <goal>" + palette.reset,
      "",
      palette.muted + "nothing is recorded yet" + palette.reset,
    ]
  }

  const state = view.status === "complete" ? `${palette.good}${view.status}` : `${palette.high}${view.status}`
  const counts = palette.info + `${view.facts} facts  ${view.intents} intents` + palette.reset
  const meterWidth = Math.max(6, inner - 18)
  const peak = Math.max(1, ...FACT_ORDER.map((kind) => view.intel[kind] ?? 0))

  const meters = FACT_ORDER.map((kind) => {
    const value = view.intel[kind] ?? 0
    const label = kind.padEnd(9)
    const rendered = bar(value, peak, meterWidth, palette)
    const tint = value > 0 ? palette.info : palette.muted
    return `${tint}${label}${palette.reset}${rendered}${tint}${String(value).padStart(3)}${palette.reset}`
  })

  return [`${state}${palette.reset}  ${counts}`, "", ...meters]
}

function missionPanel(view: EngagementView, arsenal: ArsenalView, inner: number, palette: Palette, slogan: string, height: number): string[] {
  const target = view.found ? view.goal : "no engagement loaded"
  const room = Math.max(8, inner - 2)
  const shown = visibleWidth(target) > room ? truncate(target, room - 1) + "\u2026" : target

  const frontier = view.frontier.length
  const corpus = arsenal.found && arsenal.index !== null
    ? ARSENAL_SOURCES.map((source) => `${source} ${arsenal.index?.sources[source] ?? 0}`).join("  ")
    : "no corpus"
  const sl = visibleWidth(slogan) > inner ? truncate(slogan, Math.max(0, inner - 1)) + "\u2026" : slogan

  const core = [
    palette.muted + "TARGET" + palette.reset,
    palette.brand + shown + palette.reset,
    `${palette.muted}frontier${palette.reset} ${palette.hot}${frontier}${palette.reset} ${palette.muted}open${palette.reset}`,
    `${palette.muted}${corpus}${palette.reset}`,
  ]

  // The slogan is a fixed tail and only the blank spacers flex, so the header
  // pair shares a baseline without ever dropping the slogan.
  const slack = Math.max(0, height - core.length - 1)
  const spacers = new Array<string>(slack).fill("")
  return [core[0] ?? "", core[1] ?? "", ...spacers.slice(0, 1), ...core.slice(2), ...spacers.slice(1), palette.low + sl + palette.reset]
}

function frontierPanel(view: EngagementView, inner: number, palette: Palette): string[] {
  if (!view.found) return [palette.muted + "no graph" + palette.reset]
  if (view.frontier.length === 0) return [palette.muted + "frontier is clear" + palette.reset]

  return view.frontier.slice(0, 8).map((intent) => {
    const id = palette.hot + intent.id + palette.reset
    const goal = intent.toGoal ? `${palette.crit}${"\u2192 goal"}${palette.reset}` : ""
    const room = Math.max(4, inner - visibleWidth(intent.id) - (intent.toGoal ? 8 : 0) - 2)
    const title = intent.title.length > room ? intent.title.slice(0, Math.max(1, room - 1)) + "\u2026" : intent.title
    return `${id} ${palette.info}${title}${palette.reset}${goal}`
  })
}

function arsenalPanel(view: ArsenalView, palette: Palette): string[] {
  if (!view.found || view.index === null) {
    return [palette.muted + `no arsenal corpus at ${view.dataRoot || "(unset)"}` + palette.reset, palette.low + "generate it from your own clone" + palette.reset]
  }
  const rows = ARSENAL_SOURCES.map((source) => {
    const count = view.index?.sources[source] ?? 0
    const pin = (view.index?.upstreamPins[source] ?? "").slice(0, 10)
    return `${palette.info}${source.padEnd(10)}${palette.reset}${palette.brand}${String(count).padStart(4)}${palette.reset} ${palette.muted}${pin}${palette.reset}`
  })
  return rows
}

function fit(lines: readonly string[], height: number): string[] {
  if (lines.length <= height) return [...lines]
  return [...lines.slice(0, Math.max(0, height - 1)), lines[lines.length - 1] ?? ""]
}

/**
 * Renders one complete frame. Total and pure: the same model and options always
 * produce byte-identical output, and a missing graph or corpus renders an
 * explicit notice instead of throwing.
 */
export function renderDashboard(model: DashboardModel, options: DashboardOptions): string[] {
  const { width, height, palette } = options
  const safeWidth = Math.max(20, width)
  const slogan = pickSlogan(options.sloganSeed)

  const art = renderWordmark({ width: safeWidth, palette, compact: safeWidth < wordmarkWidth(false) })
  const gap = 2
  const artWidth = Math.max(0, ...art.map((lineText) => visibleWidth(lineText)))
  const sideWidth = safeWidth - artWidth - gap

  // The header is composed at EXPLICIT widths rather than through columns(),
  // which equalizes panels and would truncate a deliberately wider side panel.
  let header = art
  if (sideWidth >= 28) {
    const mission = box("MISSION", missionPanel(model.engagement, model.arsenal, sideWidth - 2, palette, slogan, art.length - 2), sideWidth, palette)
    const rows = Math.max(art.length, mission.length)
    header = Array.from({ length: rows }, (_ignored, index) =>
      pad(art[index] ?? "", artWidth) + " ".repeat(gap) + pad(mission[index] ?? "", sideWidth),
    )
  }

  const each = Math.max(12, Math.floor((safeWidth - gap) / 2))
  const left = box("ENGAGEMENT", engagementPanel(model.engagement, each - 2, palette), each, palette)
  const right = box("FRONTIER", frontierPanel(model.engagement, each - 2, palette), each, palette)
  const middle = columns([left, right], each * 2 + gap, gap)
  const arsenal = box("ARSENAL", arsenalPanel(model.arsenal, palette), safeWidth, palette)

  const footer = pad(
    `${palette.muted}omc dash${palette.reset} ${palette.low}--watch${palette.reset} ${palette.muted}refresh${palette.reset} ${palette.low}--json${palette.reset} ${palette.muted}model${palette.reset} ${palette.low}q${palette.reset} ${palette.muted}quit${palette.reset}`,
    safeWidth,
  )

  const budget = Math.max(6, height - header.length - arsenal.length - 1)
  return [...header, ...fit(middle, budget), ...arsenal, footer]
}

export function dashboardPalette(forceOff = false): Palette {
  return createPalette(!forceOff && isColorEnabled())
}
