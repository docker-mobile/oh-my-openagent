/**
 * Typed provider/model catalog with per-agent option resolution.
 *
 * The precedence contract is the deliverable: an agent block wins over the
 * catalog entry on every field it sets, and a field it omits falls back to the
 * catalog entry rather than becoming undefined. The lookup result distinguishes
 * "no such model" from "model with no overrides" so a caller cannot conflate
 * the two.
 *
 * Absorbed from pentagi (MIT, pin cffed94) `ModelConfig`, `PriceInfo`,
 * `ModelReasoningInfo`, the `ProviderConfig` per-agent blocks and their
 * field-level resolution in `backend/pkg/providers/pconfig/config.go`, plus the
 * bundled catalog table in `backend/pkg/providers/catalog.go`. See NOTICE.
 */

/** How a model exposes extended thinking. Mirrors pentagi's ModelReasoningMode. */
export type ModelReasoningMode = "budget" | "adaptive" | "adaptive-only" | "none"

export interface ModelReasoningInfo {
  readonly mode: ModelReasoningMode
  readonly efforts: readonly string[]
}

/** An absent component means the vendor does not publish that price; it is never read as zero. */
export interface ModelPriceInfo {
  readonly input?: number
  readonly output?: number
  readonly cache_read?: number
  readonly cache_write?: number
}

export interface ModelCatalogEntry {
  readonly name: string
  readonly description: string
  readonly release_date: string
  readonly thinking: boolean
  readonly reasoning: ModelReasoningInfo
  readonly price: ModelPriceInfo | undefined
  readonly context_window: number
  readonly max_output_tokens: number
}

/**
 * The per-agent block, in the shape a config actually writes: every field is
 * optional and "absent" means "defer to the catalog entry", never "unset the
 * catalog value".
 */
export interface ModelCatalogOverride {
  readonly description?: string
  readonly release_date?: string
  readonly thinking?: boolean
  readonly reasoning?: ModelReasoningInfo
  readonly price?: Partial<ModelPriceInfo>
  readonly context_window?: number
  readonly max_output_tokens?: number
}

export interface ModelCatalog {
  readonly models: readonly ModelCatalogEntry[]
}

/** Thrown when a catalog entry violates the physical constraints on its own fields. */
export class ModelCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelCatalogError"
  }
}

/**
 * One component of a cost computation. `unset` is distinct from 0: a vendor
 * that does not publish a price makes the cost unknowable, and the caller
 * decides what that means instead of silently billing it as free.
 */
export type PriceQuery =
  | { readonly field: PriceField; readonly tokens: number; readonly price: number }
  | { readonly field: PriceField; readonly tokens: number; readonly unset: true }

export type PriceField = "input" | "output" | "cache_read" | "cache_write"

export interface PriceBreakdown {
  readonly perField: readonly PriceQuery[]
  /** Present only when every field the entry prices is published. */
  readonly total: number | null
}

export interface ModelUsage {
  readonly input: number
  readonly output: number
  readonly cache_read?: number
  readonly cache_write?: number
}

const PRICE_FIELDS = ["input", "output", "cache_read", "cache_write"] as const

/**
 * Costs a token run across the four price fields, each independent. A field the
 * entry does not price appears with `unset: true` and keeps the total null; it
 * is never silently billed as zero.
 */
export function computeCost(entry: ModelCatalogEntry, usage: ModelUsage): PriceBreakdown {
  const tokens: Record<PriceField, number> = {
    input: usage.input,
    output: usage.output,
    cache_read: usage.cache_read ?? 0,
    cache_write: usage.cache_write ?? 0,
  }

  const perField = PRICE_FIELDS.map((field) => {
    const price = entry.price?.[field]
    return typeof price === "number"
      ? { field, tokens: tokens[field], price }
      : { field, tokens: tokens[field], unset: true as const }
  })

  let total: number | null = 0
  for (const query of perField) {
    if ("unset" in query) {
      total = null
      break
    }
    total += query.price * query.tokens
  }

  return { perField, total }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

/**
 * Rejects an entry whose context window or output ceiling is physically
 * meaningless, at creation time rather than at the API boundary hours later.
 */
export function validateModelCatalogEntry(entry: ModelCatalogEntry): void {
  if (!isPositiveInteger(entry.context_window)) {
    throw new ModelCatalogError(
      `${entry.name}: context_window must be a positive integer, got ${JSON.stringify(entry.context_window)}`,
    )
  }
  if (entry.max_output_tokens > entry.context_window) {
    throw new ModelCatalogError(
      `${entry.name}: max_output_tokens ${entry.max_output_tokens} exceeds context_window ${entry.context_window}`,
    )
  }
}

/** Merges one agent block over a catalog entry; block fields win, absent fields fall back. */
export function resolveAgentOptions(entry: ModelCatalogEntry, override: ModelCatalogOverride): ModelCatalogEntry {
  const price = override.price ? { ...entry.price, ...override.price } : entry.price
  return {
    name: entry.name,
    description: override.description ?? entry.description,
    release_date: override.release_date ?? entry.release_date,
    thinking: override.thinking ?? entry.thinking,
    reasoning: override.reasoning ?? entry.reasoning,
    price,
    context_window: override.context_window ?? entry.context_window,
    max_output_tokens: override.max_output_tokens ?? entry.max_output_tokens,
  }
}

export type ModelLookup =
  | { readonly found: true; readonly entry: ModelCatalogEntry }
  | { readonly found: false }

/**
 * Looks a model up by name against a catalog. Returns a discriminated result
 * instead of a bare undefined, so "no such model" is a type-level fact rather
 * than a caller's guess about what undefined meant.
 */
export function lookupModel(catalog: ModelCatalog, name: string): ModelLookup {
  const entry = catalog.models.find((model) => model.name === name)
  return entry ? { found: true, entry } : { found: false }
}

/**
 * Builds a catalog, running the physical validation on every entry up front so
 * a malformed entry fails at construction instead of at first use.
 */
export function createModelCatalog(models: readonly ModelCatalogEntry[]): ModelCatalog {
  for (const model of models) validateModelCatalogEntry(model)
  return { models }
}
