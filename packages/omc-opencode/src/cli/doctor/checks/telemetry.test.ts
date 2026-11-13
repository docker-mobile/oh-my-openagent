/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { isolateTelemetryEnv } from "../../../../../../test-support/telemetry-env.test-helpers"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const originalXdgDataHome = process.env.XDG_DATA_HOME
const originalOmoDisablePostHog = process.env.OMC_DISABLE_POSTHOG
const originalOmoSendAnonymousTelemetry = process.env.OMC_SEND_ANONYMOUS_TELEMETRY
let restoreTelemetryEnv: () => void

function resetEnv(): void {
  if (originalXdgDataHome === undefined) {
    delete process.env.XDG_DATA_HOME
  } else {
    process.env.XDG_DATA_HOME = originalXdgDataHome
  }
  if (originalOmoDisablePostHog === undefined) {
    delete process.env.OMC_DISABLE_POSTHOG
  } else {
    process.env.OMC_DISABLE_POSTHOG = originalOmoDisablePostHog
  }
  if (originalOmoSendAnonymousTelemetry === undefined) {
    delete process.env.OMC_SEND_ANONYMOUS_TELEMETRY
  } else {
    process.env.OMC_SEND_ANONYMOUS_TELEMETRY = originalOmoSendAnonymousTelemetry
  }
}

beforeEach(() => {
  restoreTelemetryEnv = isolateTelemetryEnv()
})

afterEach(() => {
  resetEnv()
  restoreTelemetryEnv()
})

describe("checkTelemetry", () => {
  it("reports enabled status and last daily active date", async () => {
    // given
    const dataHomePath = join(tmpdir(), `doctor-telemetry-${Date.now()}-${Math.random()}`)
    const stateDir = join(dataHomePath, "oh-my-cybersecurity")
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(join(stateDir, "posthog-activity.json"), `${JSON.stringify({ lastActiveDayUTC: "2026-06-28" })}\n`)
    process.env.XDG_DATA_HOME = dataHomePath
    delete process.env.OMC_DISABLE_POSTHOG
    delete process.env.OMC_SEND_ANONYMOUS_TELEMETRY
    const { checkTelemetry } = await import(`./telemetry?enabled=${Date.now()}`)

    // when
    const result = await checkTelemetry()

    // then
    expect(result.status).toBe("pass")
    expect(result.message).toBe("Telemetry: enabled")
    expect(result.details).toContain("Last daily active date: 2026-06-28")
    rmSync(dataHomePath, { recursive: true, force: true })
  })

  it("reports disabled status when env disables PostHog", async () => {
    // given
    process.env.OMC_DISABLE_POSTHOG = "1"
    const { checkTelemetry } = await import(`./telemetry?disabled=${Date.now()}`)

    // when
    const result = await checkTelemetry()

    // then
    expect(result.status).toBe("pass")
    expect(result.message).toBe("Telemetry: disabled")
    expect(result.issues).toEqual([])
  })
})
