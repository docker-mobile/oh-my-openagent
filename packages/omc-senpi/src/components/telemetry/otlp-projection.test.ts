import { expect, test } from "bun:test"
import { ALL_KNOWN_MODEL_IDS } from "./model-vocabulary"
import { isOtlpEvent, projectOtlpEvent, OTLP_SPANS } from "./otlp-projection"
import { PINNED_MODEL_ID_LIST } from "./pinned-model-ids"
import { OMC_NATIVE_EVENT_SCHEMAS, type OmoNativePropertySchema } from "./event-schemas"
import { addTurn, openWindow, summaryProperties } from "./session-summary-window"

// Feed the client schema's actual property names and vocabulary, not relay aliases.
function clientBag(schema: Readonly<Record<string, OmoNativePropertySchema>>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [
    key, value.type === "number" ? 1 : value.type === "boolean" ? false : value.values?.[0] ?? "a".repeat(64),
  ]))
}

for (const [event, property, wire] of [
  ["daily_active", "reason", "omc.start_trigger"],
  ["session_started", "reason", "omc.start_trigger"],
  ["prompt_submitted", "suppression_reason", "omc.suppression_cause"],
  ["delegation_completed", "start_reason", "omc.start_trigger"],
] as const) {
  test(`OTLP maps real ${event} client vocabulary from ${property}`, () => {
    const schema: Readonly<Record<string, OmoNativePropertySchema>> = OMC_NATIVE_EVENT_SCHEMAS[event]
    for (const value of schema[property]?.values ?? []) {
      const bag = { ...clientBag(schema), [property]: value }
      expect(projectOtlpEvent(event, bag)[wire]).toBe(value)
    }
    for (const value of ["unrecognized", 1, true]) {
      expect(projectOtlpEvent(event, { ...clientBag(schema), [property]: value })[wire]).toBeUndefined()
    }
  })
}

test("OTLP maps real category_config user_category_count within pinned bounds", () => {
  const bag = clientBag(OMC_NATIVE_EVENT_SCHEMAS.category_config)
  expect(projectOtlpEvent("category_config", bag)["omc.custom_category_count"]).toBe(bag["user_category_count"])
  for (const value of [-1, 1e9 + 1, Infinity, "1", true]) {
    expect(projectOtlpEvent("category_config", { ...bag, user_category_count: value })["omc.custom_category_count"]).toBeUndefined()
  }
})

// Independent examples from omc-telemetry's pinned omc-senpi v4 artifact.
for (const [event, property, wire] of [
  ["category_config", "cat_architect", "omc.cat_architect"],
  ["computer_use_activation", "active", "omc.active"],
  ["computer_use_engine_error", "code", "omc.code"],
  ["computer_use_permission_denied", "permission", "omc.permission"],
  ["daily_active", "day_utc", "omc.day_utc"],
  ["delegation_completed", "task_seq", "omc.task_seq"],
  ["delegation_started", "background", "omc.background"],
  ["feature_used", "feature", "omc.feature"],
  ["handoff_hint", "action", "omc.action"],
  ["kibitzer_summary", "wakes_total", "omc.wakes_total"],
  ["parallelism_summary", "schema_kind", "omc.schema_kind"],
  ["process_crashed", "exit_code", "process.exit.code"],
  ["prompt_submitted", "is_real_user_prompt", "omc.prompt.is_real_user"],
  ["session_started", "session_role", "omc.session.role"],
  ["session_summary", "session_role", "omc.session.role"],
  ["skill_loaded", "skill_name", "omc.skill_name"],
  ["turn_completed", "turn_index", "omc.turn.index"],
] as const) {
  test(`OTLP projection pins ${event} and drops unlisted attributes`, () => {
    expect(isOtlpEvent(event)).toBe(true)
    expect(projectOtlpEvent(event, { [property]: 1, $session_id: "hash", unknown: "private", prompt_text: "private" })).toEqual({
      [wire]: 1,
      ...(event === "process_crashed" ? {} : { "session.id": "hash" }),
    })
  })
}

test("OTLP drops events not present in the pinned artifact", () => {
  expect(isOtlpEvent("omc_senpi_daily_active")).toBe(false)
  expect(projectOtlpEvent("omc_senpi_daily_active", { reason: "session_start", $session_id: "hash" })).toEqual({})
})

test("OTLP turn projection includes cache tokens in input and maps cost and provider", () => {
  expect(projectOtlpEvent("turn_completed", {
    input_tokens: 10, cache_read_tokens: 20, cache_write_tokens: 30,
    output_tokens: 5, reasoning_tokens: 2, total_tokens: 65,
    cost_1e4: 123, cost_usd: 0.0123, provider: "google",
    request_model_id: "gemini-3.1-pro", response_model_id: "gemini-3.1-pro",
  })).toEqual({
    "gen_ai.usage.input_tokens": 60,
    "gen_ai.usage.cache_read.input_tokens": 20,
    "gen_ai.usage.cache_creation.input_tokens": 30,
    "gen_ai.usage.output_tokens": 5,
    "gen_ai.usage.reasoning.output_tokens": 2,
    "omc.usage.total_tokens": 65,
    "omc.cost.usd_1e4": 123,
    "omc.provider": "google",
    "gen_ai.provider.name": "gcp.gemini",
    "gen_ai.request.model": "gemini-3.1-pro",
    "gen_ai.response.model": "gemini-3.1-pro",
  })
})

test("OTLP summary cost derives pinned integer units from the real summary USD property", () => {
  const window = openWindow(0, 1)
  addTurn(window, {
    turnIndex: 1, provider: "google", modelId: "gemini-3.1-pro",
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
    reasoningTokens: 0, totalTokens: 2, cost1e4: 57, usageValid: true,
    stopReason: "stop", toolResultCount: 0, toolErrorCount: 0,
  }, 1)
  const properties = summaryProperties("a".repeat(64), window, {
    endedBy: "shutdown", epoch: "a".repeat(16), seq: 1, sampleRate: 1,
    sampled: true, sessionRole: "main", droppedEvents: 0,
  })
  expect(properties["cost_usd"]).toBe(0.0057)
  expect(projectOtlpEvent("session_summary", properties)["omc.cost.usd_1e4"]).toBe(57)
  // Older client summaries and recovered bags need only the published USD property.
  const { cost_1e4: _internalCost, ...usdSummary } = properties
  expect(projectOtlpEvent("session_summary", usdSummary)["omc.cost.usd_1e4"]).toBe(57)
  expect(projectOtlpEvent("session_summary", { ...usdSummary, cost_usd: 0.00015 })["omc.cost.usd_1e4"]).toBe(1)
  for (const cost_usd of [-1, Infinity, NaN, 1e6 + 1, "1", true]) {
    expect(projectOtlpEvent("session_summary", { ...usdSummary, cost_usd })["omc.cost.usd_1e4"]).toBeUndefined()
  }
})

test("OTLP spans allow only the pinned turn attributes", () => {
  expect(OTLP_SPANS).toEqual({
    "omc.turn": [
      "gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.request.model", "gen_ai.response.model",
      "omc.model_id", "omc.provider", "omc.session.role", "omc.turn.index", "session.id",
    ],
  })
})

// Collector pin 13c6e61b (omc-senpi.json): omc.model_id on omc.turn_completed is a REQUIRED enum of the
// pinned model vocabulary, which lists custom. The client vocabulary can run ahead of the pin, and the
// collector rejects the whole record for an unlisted value (invalid_enum), so such a value must leave as custom.
const PIN_MODEL_IDS = new Set(PINNED_MODEL_ID_LIST)

test("#given a client model id the collector pin does not list #when turn_completed is projected #then every model key carries a pinned value", () => {
  const models = [...ALL_KNOWN_MODEL_IDS, "claude-fable-5-5", "custom"]
  for (const model of models) {
    const projected = projectOtlpEvent("turn_completed", {
      provider: "anthropic", model_id: model, request_model_id: model, response_model_id: model,
      input_tokens: 100, output_tokens: 20, cost_1e4: 1, session_role: "root",
    })
    for (const key of ["omc.model_id", "gen_ai.request.model", "gen_ai.response.model"]) {
      const value = projected[key]
      expect(typeof value === "string" && PIN_MODEL_IDS.has(value), `${key}=${String(value)} for ${model}`).toBe(true)
    }
  }
  expect(projectOtlpEvent("turn_completed", { model_id: "claude-fable-5-5" })["omc.model_id"]).toBe("custom")
  expect(projectOtlpEvent("turn_completed", { model_id: "claude-opus-5-5" })["omc.model_id"]).toBe("claude-opus-5-5")
})

test("#given an unpinned model id on another event #when it is projected #then it leaves as custom", () => {
  expect(projectOtlpEvent("session_started", { default_model: "claude-fable-5-5" })["omc.default_model"]).toBe("custom")
  expect(projectOtlpEvent("category_config", { cat_quick: "claude-fable-5-5" })["omc.cat_quick"]).toBe("custom")
  expect(projectOtlpEvent("kibitzer_summary", { model_top: "claude-fable-5-5" })["omc.model_top"]).toBe("custom")
})

test("#given session_summary top-model ranks #when they are projected #then unpinned ids leave as custom and none stays none", () => {
  const projected = projectOtlpEvent("session_summary", { m1_model: "claude-fable-5-5", m2_model: "claude-opus-5-5", m3_model: "none" })
  expect(projected["omc.m1_model"]).toBe("custom")
  expect(projected["omc.m2_model"]).toBe("claude-opus-5-5")
  expect(projected["omc.m3_model"]).toBe("none")
})

// Every string the projection emits is masked, pinned to its closed vocabulary, or listed here as open on purpose
// (hashes, dates, versions, fingerprints). A new raw field must not silently reopen invalid_enum on the collector.
const OPEN_STRING_PROPERTIES = new Set([
  "$session_id", "day_utc", "summary_epoch", "combo_fingerprint",
  "crashed_bun_version", "crashed_engine_version", "crashed_omo_version",
])

test("OTLP never emits an unlisted value for a closed string property, and only the listed properties pass raw", () => {
  const unlisted = "zz-unlisted-raw"
  const leaked: string[] = []
  for (const [event, schema] of Object.entries(OMC_NATIVE_EVENT_SCHEMAS)) {
    if (!isOtlpEvent(event)) continue
    const properties: Readonly<Record<string, OmoNativePropertySchema>> = schema
    for (const [property, spec] of Object.entries(properties)) {
      if (spec.type !== "string") continue
      const attributes = projectOtlpEvent(event, { ...clientBag(properties), [property]: unlisted })
      const raw = Object.values(attributes).includes(unlisted)
      if (raw && !OPEN_STRING_PROPERTIES.has(property)) leaked.push(`${event}.${property}`)
      if (spec.values !== undefined) {
        for (const value of Object.values(attributes)) {
          if (typeof value === "string" && value === unlisted) leaked.push(`${event}.${property} (closed)`)
        }
      }
    }
  }
  expect(leaked).toEqual([])
})

test("OTLP maps an unlisted closed value to that vocabulary's own catch-all", () => {
  expect(projectOtlpEvent("session_started", { ...clientBag(OMC_NATIVE_EVENT_SCHEMAS.session_started), session_role: "main" })["omc.session.role"]).toBe("unknown")
  expect(projectOtlpEvent("delegation_started", { ...clientBag(OMC_NATIVE_EVENT_SCHEMAS.delegation_started), name: "my-custom-agent" })["omc.name"]).toBe("custom")
})

test("session_summary re-masks a provider recovered from an older window", () => {
  const window = openWindow(0, 1)
  addTurn(window, {
    turnIndex: 1, provider: "retired-provider", modelId: "gemini-3.1-pro",
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
    reasoningTokens: 0, totalTokens: 2, cost1e4: 1, usageValid: true,
    stopReason: "stop", toolResultCount: 0, toolErrorCount: 0,
  }, 1)
  const properties = summaryProperties("a".repeat(64), window, {
    endedBy: "shutdown", epoch: "a".repeat(16), seq: 1, sampleRate: 1,
    sampled: true, sessionRole: "root", droppedEvents: 0,
  })
  expect(properties["m1_provider"]).toBe("custom")
})
