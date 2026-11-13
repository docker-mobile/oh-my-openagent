import {
  DEFAULT_POSTHOG_API_KEY,
  DEFAULT_POSTHOG_HOST,
  type TelemetryProductConfig,
} from "@oh-my-cybersecurity/telemetry-core"
import packageJson from "../../package.json" with { type: "json" }

export { DEFAULT_POSTHOG_API_KEY, DEFAULT_POSTHOG_HOST }

export const PRODUCT_NAME = "omc-codex"
export const PACKAGE_NAME = "@oh-my-cybersecurity/omc-codex"
export const CACHE_DIR_NAME = "omc-codex"
export const EVENT_NAME = "omc_codex_daily_active"
export const LEGACY_PARENT_PACKAGE = "oh-my-cybersecurity"
export const PRODUCT_ENV_PREFIX = "OMC_CODEX"

export function getProductVersion(): string {
  return packageJson.version
}

export function createCodexTelemetryProductConfig(
  packageVersion: string = getProductVersion(),
  additionalProperties?: TelemetryProductConfig["additionalProperties"],
): TelemetryProductConfig {
  const product = {
    cacheDirName: CACHE_DIR_NAME,
    defaultApiKey: DEFAULT_POSTHOG_API_KEY,
    defaultHost: DEFAULT_POSTHOG_HOST,
    eventName: EVENT_NAME,
    packageName: PACKAGE_NAME,
    packageVersion,
    platform: "omc-codex",
    productEnvPrefix: PRODUCT_ENV_PREFIX,
    productName: PRODUCT_NAME,
  }

  if (additionalProperties === undefined) {
    return product
  }

  return {
    ...product,
    additionalProperties,
  }
}
