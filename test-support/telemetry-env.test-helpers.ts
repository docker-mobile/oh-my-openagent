import { restoreEnvironment } from "./environment-integrity"

const TELEMETRY_ENV_KEYS = [
  "DO_NOT_TRACK",
  "OMC_DISABLE_TELEMETRY",
  "OMC_DISABLE_POSTHOG",
  "OMC_SEND_ANONYMOUS_TELEMETRY",
  "OMC_CODEX_DISABLE_POSTHOG",
  "OMC_CODEX_SEND_ANONYMOUS_TELEMETRY",
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "OMC_TELEMETRY_DEVICE_ID",
] as const

export function isolateTelemetryEnv(): () => void {
  const snapshot = { ...process.env }
  for (const key of TELEMETRY_ENV_KEYS) delete process.env[key]
  return () => restoreEnvironment(snapshot)
}
