import { describe, expect, test } from "bun:test"

import { OMC_NATIVE_PROPERTY_ALLOWLISTS } from "../../packages/omc-senpi/src/components/telemetry/product-identity"
import { assertAllowlistCoverage } from "./omc-native-telemetry-qa.mjs"

const EXPECTED_EVENTS = [
  "category_config",
  "computer_use_activation",
  "computer_use_engine_error",
  "computer_use_permission_denied",
  "daily_active",
  "delegation_completed",
  "delegation_started",
  "feature_used",
  "handoff_hint",
  "kibitzer_summary",
  "parallelism_summary",
  "process_crashed",
  "prompt_submitted",
  "session_started",
  "session_summary",
  "skill_loaded",
  "turn_completed",
] as const

describe("OmC Native telemetry QA allowlist source", () => {
  test("#given the shared product allowlist #when QA initializes #then it covers exactly the declared native events", () => {
    expect(() => assertAllowlistCoverage(OMC_NATIVE_PROPERTY_ALLOWLISTS)).not.toThrow()
    expect(Object.keys(OMC_NATIVE_PROPERTY_ALLOWLISTS).sort()).toEqual([...EXPECTED_EVENTS])
  })

  test("#given a missing or extra event #when QA validates coverage #then divergence fails loudly", () => {
    const { daily_active: _removed, ...missing } = OMC_NATIVE_PROPERTY_ALLOWLISTS
    expect(() => assertAllowlistCoverage(missing)).toThrow("missing=daily_active")
    expect(() => assertAllowlistCoverage({ ...OMC_NATIVE_PROPERTY_ALLOWLISTS, bogus_event: [] })).toThrow("extra=bogus_event")
  })
})
