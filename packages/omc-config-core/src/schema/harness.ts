import * as z from "zod"

export const HARNESS_IDS = ["codex", "opencode", "omc"] as const

export type HarnessId = (typeof HARNESS_IDS)[number]

export const OMC_CONFIG_HARNESS_IDS = ["opencode", "native", "codex"] as const

export const OmoHarnessIdSchema = z.enum(OMC_CONFIG_HARNESS_IDS)

export type OmoHarnessId = z.infer<typeof OmoHarnessIdSchema>

/**
 * Retired harness ids and the canonical id that replaced them.
 *
 * The standalone edition is branded OmC Native, but its harness id was minted from the engine's
 * package name before the edition had a brand of its own. `senpi` therefore stays accepted as the
 * legacy spelling of `native`: it is canonicalized when the config is read, and the startup
 * migration rewrites the file itself.
 */
export const OMC_CONFIG_LEGACY_HARNESS_ALIASES: Readonly<Record<string, OmoHarnessId>> = { senpi: "native" }

export const OMC_CONFIG_LEGACY_HARNESS_IDS = Object.keys(OMC_CONFIG_LEGACY_HARNESS_ALIASES)

export type OmoLegacyHarnessId = "senpi"
