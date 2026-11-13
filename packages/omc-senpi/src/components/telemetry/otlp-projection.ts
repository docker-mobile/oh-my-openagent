import type { OtlpWireProjection, SpanAllowlist, WireAttributes } from "@oh-my-cybersecurity/telemetry-core/otlp"
import { isOtlpEvent, type OtlpEvent } from "./otlp-events"
export { isOtlpEvent } from "./otlp-events"

import { OMC_NATIVE_EVENT_SCHEMAS, type OmoNativePropertySchema } from "./event-schemas"
import { pinnedModelId } from "./pinned-model-ids"

// Derived from omc-telemetry origin/main 13c6e61b40c49141868e7430e02a7b4b949d0c5d:
// packages/schema-registry/artifacts/omc-senpi.json (schema v4, proto v1.7.0)
// and packages/schema-registry/semconv-map.json. No unlisted event or attribute has a fallback.
// For registered semconv keys, use the map's input name: omc.prompt.is_real_user comes from
// is_real_user_prompt, although the pinned artifact still names its relay alias is_real_user.
const EVENT_FIELDS: Readonly<Record<OtlpEvent, Readonly<Record<string, string>>>> = {
  "category_config": {
    "builtin_overridden_count": "omc.builtin_overridden_count",
    "cat_architect": "omc.cat_architect",
    "cat_artistry": "omc.cat_artistry",
    "cat_deep_high": "omc.cat_deep_high",
    "cat_deep_low": "omc.cat_deep_low",
    "cat_quick": "omc.cat_quick",
    "cat_ultrabrain": "omc.cat_ultrabrain",
    "cat_unspecified_high": "omc.cat_unspecified_high",
    "cat_unspecified_low": "omc.cat_unspecified_low",
    "cat_visual_engineering": "omc.cat_visual_engineering",
    "cat_writing": "omc.cat_writing",
    "combo_fingerprint": "omc.combo_fingerprint",
    "config_generation": "omc.config_generation",
    "user_category_count": "omc.custom_category_count",
    "source": "omc.source",
    "$session_id": "session.id"
  },
  "computer_use_activation": {
    "active": "omc.active",
    "backend": "omc.backend",
    "host_platform": "omc.host_platform",
    "source": "omc.source",
    "$session_id": "session.id"
  },
  "computer_use_engine_error": {
    "backend": "omc.backend",
    "code": "omc.code",
    "host_platform": "omc.host_platform",
    "$session_id": "session.id"
  },
  "computer_use_permission_denied": {
    "backend": "omc.backend",
    "host_platform": "omc.host_platform",
    "permission": "omc.permission",
    "scope": "omc.scope",
    "$session_id": "session.id"
  },
  "daily_active": {
    "day_utc": "omc.day_utc",
    "reason": "omc.start_trigger",
    "$session_id": "session.id"
  },
  "delegation_completed": {
    "agent_type": "omc.agent_type",
    "background_mode": "omc.background_mode",
    "cache_read_tokens": "omc.cache_read_tokens",
    "cache_write_tokens": "omc.cache_write_tokens",
    "category": "omc.category",
    "config_generation": "omc.config_generation",
    "cost_status": "omc.cost_status",
    "cost_usd": "omc.cost_usd",
    "duration_ms": "omc.duration_ms",
    "duration_status": "omc.duration_status",
    "execution_mode": "omc.execution_mode",
    "fallback_attempts": "omc.fallback_attempts",
    "input_tokens": "omc.input_tokens",
    "model_id": "omc.model_id",
    "model_source": "omc.model_source",
    "output_tokens": "omc.output_tokens",
    "owner_kind": "omc.owner_kind",
    "provider": "omc.provider",
    "reasoning_effort": "omc.reasoning_effort",
    "run_epoch": "omc.run_epoch",
    "start_reason": "omc.start_trigger",
    "stats_status": "omc.stats_status",
    "status": "omc.status",
    "task_send_queued_count": "omc.task_send_queued_count",
    "task_send_running_count": "omc.task_send_running_count",
    "task_seq": "omc.task_seq",
    "token_status": "omc.token_status",
    "tool_calls": "omc.tool_calls",
    "total_tokens": "omc.total_tokens",
    "turns": "omc.turns",
    "$session_id": "session.id"
  },
  "delegation_started": {
    "background": "omc.background",
    "batch_size_bucket": "omc.batch_size_bucket",
    "kind": "omc.kind",
    "name": "omc.name",
    "$session_id": "session.id"
  },
  "feature_used": {
    "feature": "omc.feature",
    "$session_id": "session.id"
  },
  "handoff_hint": {
    "action": "omc.action",
    "context_tokens": "omc.context_tokens",
    "fresh_usd": "omc.fresh_usd",
    "model_id": "omc.model_id",
    "next_reply_usd": "omc.next_reply_usd",
    "provider": "omc.provider",
    "saving_usd": "omc.saving_usd",
    "subscription": "omc.subscription",
    "$session_id": "session.id"
  },
  "kibitzer_summary": {
    "buffered_cooldown": "omc.buffered_cooldown",
    "buffered_no_new_candidate": "omc.buffered_no_new_candidate",
    "cache_read_tokens": "omc.cache_read_tokens",
    "cache_write_tokens": "omc.cache_write_tokens",
    "candidates_total": "omc.candidates_total",
    "first_nudge_wake": "omc.first_nudge_wake",
    "generations": "omc.generations",
    "input_tokens": "omc.input_tokens",
    "model_top": "omc.model_top",
    "nudge_gap_ms_median": "omc.nudge_gap_ms_median",
    "nudge_gap_ms_p90": "omc.nudge_gap_ms_p90",
    "nudges_delivered": "omc.nudges_delivered",
    "offers_total": "omc.offers_total",
    "output_tokens": "omc.output_tokens",
    "slot_wait_ms_total": "omc.slot_wait_ms_total",
    "tool_calls_total": "omc.tool_calls_total",
    "wake_duration_ms_total": "omc.wake_duration_ms_total",
    "wake_span_ms": "omc.wake_span_ms",
    "wakes_deadline": "omc.wakes_deadline",
    "wakes_failed": "omc.wakes_failed",
    "wakes_tool_budget": "omc.wakes_tool_budget",
    "wakes_total": "omc.wakes_total",
    "wakes_with_nudge": "omc.wakes_with_nudge",
    "$session_id": "session.id"
  },
  "parallelism_summary": {
    "clock_anomalies": "omc.clock_anomalies",
    "dropped_calls": "omc.dropped_calls",
    "eval_execution_detached_count": "omc.eval_execution_detached_count",
    "eval_execution_event_bus_available": "omc.eval_execution_event_bus_available",
    "eval_execution_event_count": "omc.eval_execution_event_count",
    "eval_execution_event_rejected_count": "omc.eval_execution_event_rejected_count",
    "eval_execution_ok_count": "omc.eval_execution_ok_count",
    "eval_nested_tool_call_count": "omc.eval_nested_tool_call_count",
    "eval_nested_tool_call_error_count": "omc.eval_nested_tool_call_error_count",
    "eval_nested_tool_call_ok_count": "omc.eval_nested_tool_call_ok_count",
    "eval_nested_tool_call_pending_count": "omc.eval_nested_tool_call_pending_count",
    "eval_only_duration_ms": "omc.eval_only_duration_ms",
    "eval_only_waves": "omc.eval_only_waves",
    "eval_outer_joined_calls": "omc.eval_outer_joined_calls",
    "eval_tool_aggregate_truncated_execution_count": "omc.eval_tool_aggregate_truncated_execution_count",
    "incomplete_calls": "omc.incomplete_calls",
    "measured_eval_execution_duration_ms_sum": "omc.measured_eval_execution_duration_ms_sum",
    "measured_eval_nested_tool_duration_ms_sum": "omc.measured_eval_nested_tool_duration_ms_sum",
    "measured_turn_duration_ms_total": "omc.measured_turn_duration_ms_total",
    "mixed_non_eval_joined_calls": "omc.mixed_non_eval_joined_calls",
    "mixed_waves": "omc.mixed_waves",
    "modeled_wallclock_saved_ms": "omc.modeled_wallclock_saved_ms",
    "non_eval_joined_calls": "omc.non_eval_joined_calls",
    "non_eval_saved_round_trips": "omc.non_eval_saved_round_trips",
    "non_eval_waves_multi": "omc.non_eval_waves_multi",
    "non_eval_waves_total": "omc.non_eval_waves_total",
    "schema_kind": "omc.schema_kind",
    "upper_bound_saved_ms": "omc.upper_bound_saved_ms",
    "$session_id": "session.id"
  },
  "process_crashed": {
    "crashed_bun_version": "omc.crashed_bun_version",
    "crashed_engine_version": "omc.crashed_engine_version",
    "crashed_omo_version": "omc.crashed_omo_version",
    "detection": "omc.detection",
    "process_kind": "omc.process_kind",
    "shard_kind": "omc.shard_kind",
    "signal": "omc.signal",
    "uptime_bucket": "omc.uptime_bucket",
    "uptime_ms": "omc.uptime_ms",
    "exit_code": "process.exit.code"
  },
  "prompt_submitted": {
    "input_source": "omc.input_source",
    "invocation_stage": "omc.invocation_stage",
    "is_effective_ultrawork_invocation": "omc.is_effective_ultrawork_invocation",
    "is_turn_start": "omc.is_turn_start",
    "keyword_any": "omc.keyword_any",
    "keyword_occurrence_bucket": "omc.keyword_occurrence_bucket",
    "keyword_ultrawork_full": "omc.keyword_ultrawork_full",
    "keyword_ulw_abbrev": "omc.keyword_ulw_abbrev",
    "keyword_variant": "omc.keyword_variant",
    "is_real_user_prompt": "omc.prompt.is_real_user",
    "prompt_length_bucket": "omc.prompt_length_bucket",
    "queue_mode": "omc.queue_mode",
    "real_prompt_ordinal_bucket": "omc.real_prompt_ordinal_bucket",
    "suppression_reason": "omc.suppression_cause",
    "$session_id": "session.id"
  },
  "session_started": {
    "configured_provider_count": "omc.configured_provider_count",
    "cpu_count": "omc.cpu_count",
    "default_model": "omc.default_model",
    "default_provider": "omc.default_provider",
    "memory_bucket": "omc.memory_bucket",
    "model_count": "omc.model_count",
    "provider_count": "omc.provider_count",
    "session_role": "omc.session.role",
    "signed_in_provider_count": "omc.signed_in_provider_count",
    "reason": "omc.start_trigger",
    "$session_id": "session.id"
  },
  "session_summary": {
    "aborted_turns": "omc.aborted_turns",
    "cache_read_tokens": "omc.cache_read_tokens",
    "cache_write_tokens": "omc.cache_write_tokens",
    "custom_model_turns": "omc.custom_model_turns",
    "dropped_events": "omc.dropped_events",
    "ended_by": "omc.ended_by",
    "error_turns": "omc.error_turns",
    "first_turn_index": "omc.first_turn_index",
    "input_tokens": "omc.input_tokens",
    "invalid_usage_turns": "omc.invalid_usage_turns",
    "is_final": "omc.is_final",
    "last_turn_index": "omc.last_turn_index",
    "m1_cost_usd": "omc.m1_cost_usd",
    "m1_input_tokens": "omc.m1_input_tokens",
    "m1_model": "omc.m1_model",
    "m1_output_tokens": "omc.m1_output_tokens",
    "m1_provider": "omc.m1_provider",
    "m1_total_tokens": "omc.m1_total_tokens",
    "m1_turns": "omc.m1_turns",
    "m2_cost_usd": "omc.m2_cost_usd",
    "m2_input_tokens": "omc.m2_input_tokens",
    "m2_model": "omc.m2_model",
    "m2_output_tokens": "omc.m2_output_tokens",
    "m2_provider": "omc.m2_provider",
    "m2_total_tokens": "omc.m2_total_tokens",
    "m2_turns": "omc.m2_turns",
    "m3_cost_usd": "omc.m3_cost_usd",
    "m3_input_tokens": "omc.m3_input_tokens",
    "m3_model": "omc.m3_model",
    "m3_output_tokens": "omc.m3_output_tokens",
    "m3_provider": "omc.m3_provider",
    "m3_total_tokens": "omc.m3_total_tokens",
    "m3_turns": "omc.m3_turns",
    "model_count": "omc.model_count",
    "other_cost_usd": "omc.other_cost_usd",
    "other_total_tokens": "omc.other_total_tokens",
    "other_turns": "omc.other_turns",
    "output_tokens": "omc.output_tokens",
    "raw_turns_sampled": "omc.raw_turns_sampled",
    "reasoning_tokens": "omc.reasoning_tokens",
    "sample_rate": "omc.sample_rate",
    "session_role": "omc.session.role",
    "summary_epoch": "omc.summary_epoch",
    "summary_seq": "omc.summary_seq",
    "tool_error_count": "omc.tool_error_count",
    "tool_result_count": "omc.tool_result_count",
    "total_tokens": "omc.total_tokens",
    "total_tokens_max": "omc.total_tokens_max",
    "total_tokens_p50": "omc.total_tokens_p50",
    "total_tokens_p95": "omc.total_tokens_p95",
    "turns": "omc.turns",
    "window_ms": "omc.window_ms",
    "$session_id": "session.id"
  },
  "skill_loaded": {
    "skill_name": "omc.skill_name",
    "$session_id": "session.id"
  },
  "turn_completed": {
    "request_model_id": "gen_ai.request.model",
    "response_model_id": "gen_ai.response.model",
    "cache_write_tokens": "gen_ai.usage.cache_creation.input_tokens",
    "cache_read_tokens": "gen_ai.usage.cache_read.input_tokens",
    "input_tokens": "gen_ai.usage.input_tokens",
    "output_tokens": "gen_ai.usage.output_tokens",
    "reasoning_tokens": "gen_ai.usage.reasoning.output_tokens",
    "model_id": "omc.model_id",
    "provider": "omc.provider",
    "sample_rate": "omc.sample_rate",
    "session_role": "omc.session.role",
    "turn_index": "omc.turn.index",
    "total_tokens": "omc.usage.total_tokens",
    "$session_id": "session.id",
    "cost_1e4": "omc.cost.usd_1e4"
  }
}

export const OTLP_SPANS: SpanAllowlist = {
  "omc.turn": [
    "gen_ai.operation.name",
    "gen_ai.provider.name",
    "gen_ai.request.model",
    "gen_ai.response.model",
    "omc.model_id",
    "omc.provider",
    "omc.session.role",
    "omc.turn.index",
    "session.id"
  ]
}

const MODEL_WIRE_KEY_LIST = ["gen_ai.request.model", "gen_ai.response.model", "omc.cat_architect", "omc.cat_artistry", "omc.cat_deep_high", "omc.cat_deep_low", "omc.cat_quick", "omc.cat_ultrabrain", "omc.cat_unspecified_high", "omc.cat_unspecified_low", "omc.cat_visual_engineering", "omc.cat_writing", "omc.default_model", "omc.model_id", "omc.model_top"]

const PROVIDER_VALUES: Readonly<Record<string, string>> = {
  "alibaba-token-plan": "alibaba-token-plan",
  "alibaba-token-plan-cn": "alibaba-token-plan-cn",
  "anthropic": "anthropic",
  "anthropic-api": "anthropic-api",
  "anthropic-subscription": "anthropic-subscription",
  "bailian-coding-plan": "bailian-coding-plan",
  "chatgpt-subscription": "chatgpt-subscription",
  "claude-sdk-oauth": "claude-sdk-oauth",
  "deepseek": "deepseek",
  "google": "gcp.gemini",
  "google-vertex": "gcp.vertex_ai",
  "github-copilot": "github-copilot",
  "kimi-coding": "kimi-coding",
  "kimi-for-coding": "kimi-for-coding",
  "moonshotai": "moonshotai",
  "openai": "openai",
  "openai-codex": "openai-codex",
  "opencode": "opencode",
  "opencode-go": "opencode-go",
  "qwen-token-plan": "qwen-token-plan",
  "qwen-token-plan-cn": "qwen-token-plan-cn",
  "vercel": "vercel",
  "xai": "x_ai",
  "xiaomi": "xiaomi",
  "zai": "zai",
  "zai-coding-cn": "zai-coding-cn",
  "zai-coding-plan": "zai-coding-plan",
  "custom": "custom"
}

// Wire keys whose pinned enum is the model vocabulary (see pinned-model-ids.ts).
const MODEL_WIRE_KEYS: ReadonlySet<string> = new Set(MODEL_WIRE_KEY_LIST)
// session_summary's top-model keys use the same vocabulary plus "none" (no model in that rank).
const RANKED_MODEL_WIRE_KEYS: ReadonlySet<string> = new Set(["omc.m1_model", "omc.m2_model", "omc.m3_model"])

// Optional aliases use the collector pin's closed vocabulary, not future client additions.
const START_TRIGGERS: Readonly<Record<string, readonly string[]>> = {
  daily_active: ["session_start"],
  session_started: ["startup", "reload", "new", "resume", "fork"],
  delegation_completed: [
    "initial_spawn", "runtime_fallback", "session_resume", "dag_retry", "revive_after_completed",
    "revive_after_error", "revive_after_cancelled", "revive_after_interrupted", "revive_after_lost", "unknown",
  ],
}
const SUPPRESSION_CAUSES = [
  "none", "no_keyword", "identifier_reference", "negated_mention", "extension_source",
  "child_session", "embedded_directive", "skill_expansion", "skill_name_only",
]

// The collector refuses a whole record for one unlisted enum value (invalid_enum). A closed string property
// therefore never leaves raw when its value is outside the client vocabulary: it becomes that vocabulary's own
// catch-all (custom, then unknown, then other), or is left out when the vocabulary has none.
const CLOSED_FALLBACKS = ["custom", "unknown", "other"] as const

function closedValues(event: OtlpEvent, property: string): readonly string[] | undefined {
  const schema: Readonly<Record<string, OmoNativePropertySchema>> | undefined = OMC_NATIVE_EVENT_SCHEMAS[event]
  return schema?.[property]?.values
}

function isOutsideClosedVocabulary(event: OtlpEvent, property: string, value: string): boolean {
  const values = closedValues(event, property)
  return values !== undefined && !values.includes(value)
}

function closedFallback(event: OtlpEvent, property: string): string | undefined {
  const values = closedValues(event, property)
  return CLOSED_FALLBACKS.find((fallback) => values?.includes(fallback) === true)
}

export const projectOtlpEvent: OtlpWireProjection = (event, properties) => {
  if (!isOtlpEvent(event)) return {}
  const attributes: WireAttributes = {}
  for (const [property, wire] of Object.entries(EVENT_FIELDS[event] ?? {})) {
    const value = properties[property]
    if (wire === "omc.start_trigger" && (typeof value !== "string" || !START_TRIGGERS[event]?.includes(value))) continue
    if (wire === "omc.suppression_cause" && (typeof value !== "string" || !SUPPRESSION_CAUSES.includes(value))) continue
    if (wire === "omc.custom_category_count" && (typeof value !== "number" || value < 0 || value > 1e9)) continue
    if (typeof value === "string" && MODEL_WIRE_KEYS.has(wire)) {
      attributes[wire] = pinnedModelId(value)
    } else if (typeof value === "string" && RANKED_MODEL_WIRE_KEYS.has(wire)) {
      attributes[wire] = value === "none" ? value : pinnedModelId(value)
    } else if (typeof value === "string" && isOutsideClosedVocabulary(event, property, value)) {
      const fallback = closedFallback(event, property)
      if (fallback !== undefined) attributes[wire] = fallback
    } else if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      attributes[wire] = value
    }
  }
  if (event === "session_summary") {
    const usd = properties["cost_usd"]
    if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0 && usd <= 1e6) {
      attributes["omc.cost.usd_1e4"] = Math.round(usd * 10_000)
    }
  }
  if (event === "turn_completed") {
    const input = properties["input_tokens"]
    if (typeof input === "number" && Number.isFinite(input)) {
      const read = properties["cache_read_tokens"]
      const write = properties["cache_write_tokens"]
      const inclusive = input + (typeof read === "number" && Number.isFinite(read) ? read : 0)
        + (typeof write === "number" && Number.isFinite(write) ? write : 0)
      if (Number.isFinite(inclusive)) attributes["gen_ai.usage.input_tokens"] = inclusive
    }
    const provider = properties["provider"]
    if (typeof provider === "string" && Object.hasOwn(PROVIDER_VALUES, provider)) {
      const providerName = PROVIDER_VALUES[provider]
      if (providerName !== undefined) attributes["gen_ai.provider.name"] = providerName
    }
  }
  return attributes
}
