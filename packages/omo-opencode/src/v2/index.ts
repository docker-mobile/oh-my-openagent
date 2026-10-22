/**
 * OpenCode V2 entry — spine scaffold + V1-assembly bridge.
 *
 * This module exports the V2 plugin definition (`omoV2Plugin`, `setup`).
 * It is exposed as the package subpath `./v2` (see package.json exports), so
 * V2 hosts load this entry directly while V1 hosts keep loading the package
 * root (`../index`, the untouched V1 PluginModule) and never evaluate this
 * file. V1 behaviour is unchanged.
 *
 * The slices landed first (scaffold, tools/hooks, agents) register a native
 * subset of the OMC surface on the `@opencode/plugin` 2.x domain API. This
 * slice adds the V1-assembly bridge (light-bringer, upstream #10106): the
 * setup runs the REAL V1 plugin body (`createPluginModule().server`) against
 * a V1-shaped input derived from the V2 context and installs what its hooks
 * define — tools, agents (with the dynamic prompt builders), MCP servers,
 * commands, config — onto the 2.x domains. The bridge owns the domain
 * registrations; the native slice registrations stay as the escape hatch
 * that runs when the bridge cannot start, and the `omo.status` bootstrap RPC
 * plus the parity-matrix discipline stay regardless.
 */
import { Plugin } from "@opencode/plugin"
import { z } from "zod"

import { createV2Setup } from "./create-v2-setup"
import type { V2Cleanup, V2PluginContext } from "./context-types"
import { registerAgents } from "./agents"
import { registerToolsAndHooks } from "./tools"
import { log } from "../shared/logger"

export type { DualPluginModule } from "./dual-plugin-module"
export { setupV2Tui, type V2TuiSetup } from "./tui-setup"
export { V2UnsupportedOperationError } from "./unsupported-operation-error"

const bootstrapRpc = {
  id: "omo",
  methods: {
    status: {
      input: z.object({}),
      output: z.object({ ok: z.boolean(), stage: z.string() }),
    },
  },
  events: {},
} as const

/** Minimal structural view of the V1 module the bridge runs. */
type V1ServerPlugin = (input: never, options?: unknown) => Promise<unknown>

export type V2EntryOptions = {
  /** Builds the V1 plugin module the bridge runs. Tests inject a stub or a throwing factory. */
  readonly createV1Module?: () => { readonly server: V1ServerPlugin }
  readonly warn?: (message: string) => void
}

async function defaultCreateV1Module(): Promise<{ readonly server: V1ServerPlugin }> {
  // Lazy import: only a 2.x host that calls setup pays for the V1 plugin graph.
  const { createPluginModule } = await import("../testing/create-plugin-module")
  return createPluginModule() as unknown as { readonly server: V1ServerPlugin }
}

/**
 * Builds the merged V2 plugin: bootstrap RPC first, then the bridge running
 * the real V1 plugin body, with the native slice registrations as the escape
 * hatch when the bridge cannot start.
 */
export function createOmoV2Plugin(options: V2EntryOptions = {}) {
  return Plugin.define({
    id: "oh-my-openagent",
    async setup(ctx) {
      let stage = "bootstrap"
      ctx.rpc.register(bootstrapRpc, {
        status: async () => ({ ok: true, stage }),
      })
      const warn = options.warn ?? ((message: string) => log(`[v2] ${message}`))
      const buildV1Module = options.createV1Module ?? defaultCreateV1Module
      const cleanups: Array<V2Cleanup> = []
      try {
        const v1Module = await buildV1Module()
        const bridgeSetup = createV2Setup({
          serverPlugin: v1Module.server as never,
          warn,
        })
        cleanups.push(await bridgeSetup(ctx as unknown as V2PluginContext))
        stage = "bridge"
      } catch (error) {
        warn(`bridge failed to start, falling back to the native registrations: ${String(error)}`)
        const disposeTools = await registerToolsAndHooks(ctx)
        const disposeAgents = await registerAgents(ctx)
        cleanups.push(async () => {
          await disposeTools()
          await disposeAgents()
        })
        stage = "native-fallback"
      }
      return async () => {
        for (const cleanup of [...cleanups].reverse()) {
          await cleanup()
        }
      }
    },
  })
}

export const omoV2Plugin = createOmoV2Plugin()

export default omoV2Plugin
