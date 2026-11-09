import {
  resolveModelForDelegateTask as resolveModelForDelegateTaskCore,
  type DelegateModelResolutionInput,
  type DelegateModelResolutionResult,
} from "@oh-my-opencode/delegate-core"
import * as connectedProvidersCache from "../../shared/connected-providers-cache"
import * as exhaustedProvidersCache from "../../shared/exhausted-providers-cache"
import { fuzzyMatchModel } from "../../shared/model-availability"
import { log } from "../../shared/logger"

export type { DelegateModelResolutionInput, DelegateModelResolutionResult }

function filterExhaustedProviders(providers: readonly string[] | null): readonly string[] | null {
  if (!providers) return null
  const exhausted = exhaustedProvidersCache.getExhaustedProviderIDs()
  if (exhausted.length === 0) return providers
  const exhaustedSet = new Set(exhausted.map((providerID) => providerID.toLowerCase()))
  return providers.filter((providerID) => !exhaustedSet.has(providerID.toLowerCase()))
}

export function resolveModelForDelegateTask(input: DelegateModelResolutionInput & { inheritedModel?: string }): DelegateModelResolutionResult {
  // Parent-model inheritance (#2738): an explicit user model still wins; the inherited parent
  // model is matched against available providers before any category/agent default.
  if (!input.userModel && input.inheritedModel) {
    const inherited = input.inheritedModel.trim()
    if (inherited) {
      if (input.availableModels.size === 0) return { model: inherited }
      const parts = inherited.split("/")
      const providerHint = parts.length >= 2 ? [parts[0]] : undefined
      const match = fuzzyMatchModel(inherited, input.availableModels, providerHint)
      if (match) return { model: match }
    }
  }
  const connectedProviders = input.availableModels.size === 0
    ? filterExhaustedProviders(connectedProvidersCache.readConnectedProvidersCache())
    : null

  return resolveModelForDelegateTaskCore(input, {
    connectedProviders,
    hasProviderModelsCache: connectedProvidersCache.hasProviderModelsCache(),
    hasConnectedProvidersCache: connectedProvidersCache.hasConnectedProvidersCache(),
    log,
  })
}
