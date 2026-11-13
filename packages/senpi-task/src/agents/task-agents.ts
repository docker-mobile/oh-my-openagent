import type { OmoConfig } from "@oh-my-cybersecurity/omc-config-core"

import { BUILTIN_AGENTS, CURATED_READONLY_AGENT_NAMES, ULW_REVIEWER_AGENT_NAMES } from "./builtin"
import { mapOmoConfigAgents } from "./omc-config-agents"
import type { AgentDefinition } from "./types"

/**
 * The agents a task spawn can address: the builtins overlaid with omc.json `agents`, the curated
 * read-only agents and the ulw reviewers pinned in-process. `omc doctor --models` reads the same set.
 */
export function resolveTaskAgents(config: OmoConfig): Readonly<Record<string, AgentDefinition>> {
  const merged: Record<string, AgentDefinition> = { ...BUILTIN_AGENTS }
  for (const [name, definition] of Object.entries(mapOmoConfigAgents(config))) {
    merged[name] = { ...merged[name], ...definition }
  }
  for (const name of [...CURATED_READONLY_AGENT_NAMES, ...ULW_REVIEWER_AGENT_NAMES]) {
    const definition = merged[name]
    if (definition !== undefined) merged[name] = { ...definition, executionMode: "in-process" }
  }
  return merged
}
