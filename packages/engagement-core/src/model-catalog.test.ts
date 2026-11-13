import { describe, expect, test } from "bun:test"

import {
  ModelCatalogError,
  computeCost,
  createModelCatalog,
  lookupModel,
  resolveAgentOptions,
  type ModelCatalogEntry,
} from "./model-catalog"

const baseEntry: ModelCatalogEntry = {
  name: "moonshotai/kimi-k2.6",
  description: "frontier kimi release",
  release_date: "2026-01-15",
  thinking: true,
  reasoning: { mode: "adaptive", efforts: ["low", "medium", "high"] },
  price: { input: 0.4, output: 2.0, cache_read: 0.1, cache_write: 0.5 },
  context_window: 256000,
  max_output_tokens: 32000,
}

describe("model lookup", () => {
  test("#given a name in the catalog #when looked up #then found is true with the typed entry", () => {
    const catalog = createModelCatalog([baseEntry])
    const result = lookupModel(catalog, "moonshotai/kimi-k2.6")

    expect(result.found).toBe(true)
    if (result.found) expect(result.entry.context_window).toBe(256000)
  })

  test("#given an unknown name #when looked up #then found is false rather than a bare undefined", () => {
    const catalog = createModelCatalog([baseEntry])
    const result = lookupModel(catalog, "no/such-model")

    expect(result.found).toBe(false)
    if (!result.found) expect("entry" in result).toBe(false)
  })
})

describe("per-agent resolution precedence", () => {
  test("#given an agent block that sets thinking #when resolved #then the block wins over the catalog", () => {
    const resolved = resolveAgentOptions(baseEntry, { thinking: false })

    expect(resolved.thinking).toBe(false)
  })

  test("#given an agent block that sets reasoning #when resolved #then the block wins wholesale", () => {
    const resolved = resolveAgentOptions(baseEntry, {
      reasoning: { mode: "none", efforts: [] },
    })

    expect(resolved.reasoning).toEqual({ mode: "none", efforts: [] })
  })

  test("#given an agent block that omits a field #when resolved #then the catalog entry fills it", () => {
    const resolved = resolveAgentOptions(baseEntry, { thinking: false })

    expect(resolved.release_date).toBe("2026-01-15")
    expect(resolved.reasoning).toEqual(baseEntry.reasoning)
    expect(resolved.context_window).toBe(256000)
    expect(resolved.max_output_tokens).toBe(32000)
  })

  test("#given an agent block that omits everything #when resolved #then no field becomes undefined", () => {
    const resolved = resolveAgentOptions(baseEntry, {})

    expect(resolved).toEqual(baseEntry)
  })

  test("#given an agent block that prices only output #when resolved #then the other price fields fall back", () => {
    const resolved = resolveAgentOptions(baseEntry, { price: { output: 9.0 } })

    expect(resolved.price).toEqual({ input: 0.4, output: 9.0, cache_read: 0.1, cache_write: 0.5 })
  })

  test("#given a block overriding window and ceiling #when resolved #then the block values win", () => {
    const resolved = resolveAgentOptions(baseEntry, { context_window: 128000, max_output_tokens: 16000 })

    expect(resolved.context_window).toBe(128000)
    expect(resolved.max_output_tokens).toBe(16000)
  })
})

describe("cost computation", () => {
  test("#given all four price fields published #when cost is computed #then each field contributes independently", () => {
    const cost = computeCost(baseEntry, { input: 1000, output: 500, cache_read: 2000, cache_write: 100 })

    expect(cost.total).toBe(0.4 * 1000 + 2.0 * 500 + 0.1 * 2000 + 0.5 * 100)
    expect(cost.perField).toHaveLength(4)
  })

  test("#given a missing price field #when cost is computed #then that field reports unset and the total is null", () => {
    const entry: ModelCatalogEntry = { ...baseEntry, price: { input: 0.4, output: 2.0, cache_read: 0.1, cache_write: 0.5 } }
    const noCacheWrite: ModelCatalogEntry = { ...entry, price: { input: 0.4, output: 2.0, cache_read: 0.1, cache_write: 0.5 } }
    const priced = noCacheWrite.price
    const stripped: ModelCatalogEntry = { ...noCacheWrite, price: priced ? { input: priced.input, output: priced.output, cache_read: priced.cache_read, cache_write: undefined as never } : undefined }

    const cost = computeCost(stripped, { input: 10, output: 10 })

    const cacheWrite = cost.perField.find((q) => q.field === "cache_write")
    expect(cacheWrite && "unset" in cacheWrite).toBe(true)
    expect(cost.total).toBeNull()
  })

  test("#given an entry with no price at all #when cost is computed #then every field is unset and the total is null", () => {
    const entry: ModelCatalogEntry = { ...baseEntry, price: undefined }

    const cost = computeCost(entry, { input: 10, output: 10 })

    expect(cost.perField.every((q) => "unset" in q)).toBe(true)
    expect(cost.total).toBeNull()
  })

  test("#given a published zero price #when cost is computed #then it is a real price, not an unset field", () => {
    const free: ModelCatalogEntry = { ...baseEntry, price: { input: 0, output: 0, cache_read: 0, cache_write: 0 } }

    const cost = computeCost(free, { input: 100, output: 100 })

    expect(cost.total).toBe(0)
    expect(cost.perField.every((q) => "price" in q)).toBe(true)
  })

  test("#given cache usage omitted from the run #when cost is computed #then those token counts are zero, not unset", () => {
    const cost = computeCost(baseEntry, { input: 1000, output: 1000 })

    const cacheRead = cost.perField.find((q) => q.field === "cache_read")
    expect(cacheRead && "price" in cacheRead && cacheRead.tokens).toBe(0)
  })
})

describe("catalog entry validation", () => {
  test("#given a positive integer window #when validated #then it passes", () => {
    expect(() => createModelCatalog([baseEntry])).not.toThrow()
  })

  test("#given a zero or negative window #when the entry is built #then it is rejected", () => {
    expect(() => createModelCatalog([{ ...baseEntry, context_window: 0 }])).toThrow(ModelCatalogError)
    expect(() => createModelCatalog([{ ...baseEntry, context_window: -1 }])).toThrow(ModelCatalogError)
  })

  test("#given a fractional or non-numeric window #when the entry is built #then it is rejected", () => {
    expect(() => createModelCatalog([{ ...baseEntry, context_window: 128.5 }])).toThrow(ModelCatalogError)
    expect(() => createModelCatalog([{ ...baseEntry, context_window: "big" as unknown as number }])).toThrow(
      ModelCatalogError,
    )
  })

  test("#given max_output_tokens above the window #when the entry is built #then it is rejected", () => {
    expect(() => createModelCatalog([{ ...baseEntry, context_window: 1000, max_output_tokens: 1001 }])).toThrow(
      /exceeds context_window/,
    )
  })

  test("#given max_output_tokens equal to the window #when the entry is built #then it passes", () => {
    expect(() => createModelCatalog([{ ...baseEntry, context_window: 1000, max_output_tokens: 1000 }])).not.toThrow()
  })
})
