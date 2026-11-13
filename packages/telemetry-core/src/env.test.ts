import { describe, expect, test } from "bun:test"

import {
  UNCONFIGURED_POSTHOG_API_KEY,
  hasTelemetryApiKey,
  shouldDisableTelemetry,
} from "./index"

const OPT_OUT_CASES = [
  ["unset env enables telemetry", {}, false],
  ["global disable 1", { OMC_DISABLE_POSTHOG: "1" }, true],
  ["global disable true", { OMC_DISABLE_POSTHOG: "true" }, true],
  ["global disable yes", { OMC_DISABLE_POSTHOG: "yes" }, true],
  ["global disable trims and lowercases", { OMC_DISABLE_POSTHOG: " TRUE " }, true],
  ["global send 0", { OMC_SEND_ANONYMOUS_TELEMETRY: "0" }, true],
  ["global send false", { OMC_SEND_ANONYMOUS_TELEMETRY: "false" }, true],
  ["global send no", { OMC_SEND_ANONYMOUS_TELEMETRY: "no" }, true],
  ["global send trims and lowercases", { OMC_SEND_ANONYMOUS_TELEMETRY: " No " }, true],
  ["codex disable 1", { OMC_CODEX_DISABLE_POSTHOG: "1" }, true],
  ["codex disable true", { OMC_CODEX_DISABLE_POSTHOG: "true" }, true],
  ["codex disable yes", { OMC_CODEX_DISABLE_POSTHOG: "yes" }, true],
  ["codex disable trims and lowercases", { OMC_CODEX_DISABLE_POSTHOG: " YES " }, true],
  ["codex send 0", { OMC_CODEX_SEND_ANONYMOUS_TELEMETRY: "0" }, true],
  ["codex send false", { OMC_CODEX_SEND_ANONYMOUS_TELEMETRY: "false" }, true],
  ["codex send no", { OMC_CODEX_SEND_ANONYMOUS_TELEMETRY: "no" }, true],
  ["codex send trims and lowercases", { OMC_CODEX_SEND_ANONYMOUS_TELEMETRY: " FALSE " }, true],
  ["approved codex send yes convergence", { OMC_CODEX_SEND_ANONYMOUS_TELEMETRY: "yes" }, true],
  ["invalid disable value", { OMC_CODEX_DISABLE_POSTHOG: "maybe" }, false],
  ["global telemetry disable 1", { OMC_DISABLE_TELEMETRY: "1" }, true],
  ["global telemetry disable true", { OMC_DISABLE_TELEMETRY: "true" }, true],
  ["global telemetry disable yes", { OMC_DISABLE_TELEMETRY: "yes" }, true],
  ["global telemetry disable trims and lowercases", { OMC_DISABLE_TELEMETRY: " Yes " }, true],
  ["global telemetry disable 0 keeps telemetry on", { OMC_DISABLE_TELEMETRY: "0" }, false],
  ["global telemetry disable empty keeps telemetry on", { OMC_DISABLE_TELEMETRY: "" }, false],
] as const

describe("telemetry API key configuration", () => {
  test.each([
    ["empty", "", false],
    ["whitespace-only", "   ", false],
    ["exact unconfigured placeholder", UNCONFIGURED_POSTHOG_API_KEY, false],
    ["longer key containing the placeholder", `${UNCONFIGURED_POSTHOG_API_KEY}_configured`, true],
  ] as const)("#given %s input #when key availability is checked #then the expected result is returned", (_name, apiKey, expected) => {
    expect(hasTelemetryApiKey({ POSTHOG_API_KEY: apiKey })).toBe(expected)
  })
})

describe("opt-out telemetry env matrix", () => {
  test.each(OPT_OUT_CASES)(
    "#given %s #when evaluated #then disabled=%p",
    (_name, env, expected) => {
      // given
      const productPrefix = "OMC_CODEX"

      // when
      const result = shouldDisableTelemetry({ env, productEnvPrefix: productPrefix })

      // then
      expect(result).toBe(expected)
    },
  )
})

describe("DO_NOT_TRACK global opt-out", () => {
  describe("#given DO_NOT_TRACK is 1", () => {
    test.each([
      ["omc-opencode", "OMC_OPENCODE"],
      ["omc-codex", "OMC_CODEX"],
      ["omc-senpi", "OMC_SENPI"],
    ] as const)("#when evaluated for %s #then telemetry is disabled", (_product, productEnvPrefix) => {
      // when
      const result = shouldDisableTelemetry({
        env: { DO_NOT_TRACK: "1" },
        productEnvPrefix,
      })

      // then
      expect(result).toBe(true)
    })
  })

  describe("#given DO_NOT_TRACK uses existing flag normalization", () => {
    test("#when the value is space-padded mixed case #then telemetry is disabled", () => {
      // when
      const result = shouldDisableTelemetry({
        env: { DO_NOT_TRACK: " TRUE " },
        productEnvPrefix: "OMC_SENPI",
      })

      // then
      expect(result).toBe(true)
    })
  })

  describe("#given DO_NOT_TRACK is not an opt-out value", () => {
    test.each([
      ["0", { DO_NOT_TRACK: "0" }],
      ["unset", {}],
    ] as const)("#when the value is %s #then telemetry remains enabled", (_name, env) => {
      // when
      const result = shouldDisableTelemetry({ env, productEnvPrefix: "OMC_SENPI" })

      // then
      expect(result).toBe(false)
    })
  })

  describe("#given the same env object changes between evaluations", () => {
    test("#when DO_NOT_TRACK changes #then each call reads the current value", () => {
      // given
      const env: Record<string, string | undefined> = { DO_NOT_TRACK: "false" }

      // when
      const beforeOptOut = shouldDisableTelemetry({ env, productEnvPrefix: "OMC_SENPI" })
      env.DO_NOT_TRACK = "yes"
      const duringOptOut = shouldDisableTelemetry({ env, productEnvPrefix: "OMC_SENPI" })
      env.DO_NOT_TRACK = ""
      const afterOptOut = shouldDisableTelemetry({ env, productEnvPrefix: "OMC_SENPI" })

      // then
      expect([beforeOptOut, duringOptOut, afterOptOut]).toEqual([false, true, false])
    })
  })
})
