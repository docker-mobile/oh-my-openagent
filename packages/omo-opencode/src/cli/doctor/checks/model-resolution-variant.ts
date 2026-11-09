import { resolveAgentVariant } from "../../../shared/agent-variant"
import type { ModelRequirement } from "../../../shared/model-requirements"
import { displayConfigIdentifier } from "@oh-my-opencode/omo-config-core"
import type { OmoConfig } from "./model-resolution-types"

export function formatModelWithVariant(model: string, variant?: string): string {
  return displayConfigIdentifier(variant ? `${model} (${variant})` : model)
}

/** The builtin requirement's own default effort, shown when nothing user-configured applies. */
export function getBuiltinVariant(requirement: ModelRequirement): string | undefined {
  const firstEntry = requirement.fallbackChain[0]
  return firstEntry?.variant ?? requirement.variant
}

/** The runtime's own agent reasoning precedence (resolveAgentVariant), then the builtin chain. */
export function getEffectiveVariant(
  agentName: string,
  requirement: ModelRequirement,
  config: OmoConfig
): string | undefined {
  return resolveAgentVariant(config, agentName) ?? getBuiltinVariant(requirement)
}
