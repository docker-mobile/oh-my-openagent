import {
  DEFAULT_POSTHOG_API_KEY,
  DEFAULT_POSTHOG_HOST,
  type TelemetryProductConfig,
} from "@oh-my-cybersecurity/telemetry-core"
import packageJson from "../../../../package.json" with { type: "json" }
import { CACHE_DIR_NAME, PLUGIN_NAME, PUBLISHED_PACKAGE_NAME } from "./plugin-identity"

export function createOpencodeTelemetryProductConfig(): TelemetryProductConfig {
  return {
    cacheDirName: CACHE_DIR_NAME,
    defaultApiKey: DEFAULT_POSTHOG_API_KEY,
    defaultHost: DEFAULT_POSTHOG_HOST,
    eventName: "omc_daily_active",
    packageName: PUBLISHED_PACKAGE_NAME,
    packageVersion: packageJson.version,
    platform: "oh-my-cybersecurity",
    productEnvPrefix: "OMO",
    productName: PUBLISHED_PACKAGE_NAME,
    additionalProperties: {
      plugin_name: PLUGIN_NAME,
    },
  }
}
