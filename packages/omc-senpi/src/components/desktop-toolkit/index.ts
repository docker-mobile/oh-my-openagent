import type { OmoSenpiComponent } from "../../extension/types"
import { DESKTOP_TOOLKIT_SIDE } from "./hand-lifetime"

export const DESKTOP_TOOLKIT_TOOL_NAME = "omc_desktop_toolkit"
export const TOOLKIT_REQUEST_EVENT = "omc.toolkit.request"
export const TOOLKIT_GRANT_RPC = "omc.toolkit.grant"
export const TOOLKITS_CONTEXT_KEY = "omc_toolkits"

export interface ToolkitGrant {
  readonly endpoint: string
  readonly tokenFile: string
}

export function createDesktopToolkitComponent(options: { readonly timeoutMs?: number; readonly loadSdk?: () => Promise<unknown> } = {}): OmoSenpiComponent {
  return {
    name: "desktop-toolkit",
    async register(pi, ctx) {
      if (typeof pi.registerTool !== "function") return
      const context = pi.sessionContext
      if (pi.rpc !== undefined && typeof context === "object" && context !== null &&
        "omc_toolkits" in context && typeof context.omc_toolkits === "string" && context.omc_toolkits.trim() !== "") {
        const { createDesktopToolkitRuntime } = await import("#omc-desktop-toolkit-runtime")
        return createDesktopToolkitRuntime(options).register(pi, ctx)
      }
      ctx.logger.debug?.("desktop thread toolkit unavailable", { reason: "not_offered" })
      pi.registerTool({
        name: "omc_desktop_toolkit",
        label: "Desktop toolkit",
        description: "Internal channel for skills: ask the app for a toolkit it hosts for this thread. Not for direct use.",
        parameters: {
          type: "object", properties: { op: { type: "string", enum: ["acquire"] }, toolkit: { type: "string" } },
          required: ["op", "toolkit"], additionalProperties: false,
        },
        exposure: "eval", permissionParser: () => [], executionMode: "parallel", ...DESKTOP_TOOLKIT_SIDE,
        async execute(_id: string, params: { readonly op?: unknown; readonly toolkit?: unknown }) {
          const reason = params.op === "acquire" && typeof params.toolkit === "string" && params.toolkit !== "" ? "unavailable" : "invalid_request"
          const details = { ok: false, reason }
          return { content: [{ type: "text", text: JSON.stringify(details) }], details }
        },
      })
    },
  }
}
