import { describe, expect, it } from "bun:test"
import { DEFAULT_POSTHOG_API_KEY } from "@oh-my-cybersecurity/telemetry-core"
import packageJson from "../../../../package.json" with { type: "json" }
import { PLUGIN_NAME } from "./plugin-identity"
import { createOpencodeTelemetryProductConfig } from "./telemetry-product-identity"

describe("createOpencodeTelemetryProductConfig", () => {
  it("pins the omc-opencode telemetry identity for zero data breakage", () => {
    // given
    const expectedVersion = packageJson.version

    // when
    const product = createOpencodeTelemetryProductConfig()

    // then
    expect(product).toMatchObject({
      cacheDirName: "oh-my-cybersecurity",
      defaultApiKey: DEFAULT_POSTHOG_API_KEY,
      eventName: "omc_daily_active",
      packageName: "oh-my-cybersecurity",
      packageVersion: expectedVersion,
      platform: "oh-my-cybersecurity",
      productEnvPrefix: "OMO",
      productName: "oh-my-cybersecurity",
      additionalProperties: {
        plugin_name: PLUGIN_NAME,
      },
    })
  })
})
