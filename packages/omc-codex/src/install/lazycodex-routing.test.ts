/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test"
import process from "node:process"
import { resolveInstallArgs } from "../../../omc-opencode/src/cli/cli-program"
import { argsToConfig } from "../../../omc-opencode/src/cli/install-validators"

describe("lazycodex install routing", () => {
  const originalInvocationName = process.env.OMC_INVOCATION_NAME

  afterEach(() => {
    if (originalInvocationName === undefined) {
      delete process.env.OMC_INVOCATION_NAME
    } else {
      process.env.OMC_INVOCATION_NAME = originalInvocationName
    }
  })

  test("defaults platform to codex when invoked as lazycodex", () => {
    // given
    process.env.OMC_INVOCATION_NAME = "lazycodex"

    // when
    const args = resolveInstallArgs({
      tui: false,
      claude: "no",
      gemini: "no",
      copilot: "no",
    })
    const config = argsToConfig(args)

    // then
    expect(args.platform).toBe("codex")
    expect(config.hasCodex).toBe(true)
    expect(config.hasOpenCode).toBe(false)
  })

  test("defaults platform to codex when invoked as lazycodex-ai", () => {
    // given
    process.env.OMC_INVOCATION_NAME = "lazycodex-ai"

    // when
    const args = resolveInstallArgs({
      tui: false,
      claude: "no",
      gemini: "no",
      copilot: "no",
    })
    const config = argsToConfig(args)

    // then
    expect(args.platform).toBe("codex")
    expect(config.hasCodex).toBe(true)
    expect(config.hasOpenCode).toBe(false)
  })

  test("respects explicit --platform=both", () => {
    // given
    process.env.OMC_INVOCATION_NAME = "lazycodex"

    // when
    const args = resolveInstallArgs({
      tui: false,
      claude: "no",
      gemini: "no",
      copilot: "no",
      platform: "both",
    })
    const config = argsToConfig(args)

    // then
    expect(args.platform).toBe("both")
    expect(config.hasCodex).toBe(true)
    expect(config.hasOpenCode).toBe(true)
  })

  test("leaves omc install unresolved so argsToConfig applies opencode default", () => {
    // given
    process.env.OMC_INVOCATION_NAME = "oh-my-cybersecurity"

    // when
    const args = resolveInstallArgs({
      tui: false,
      claude: "no",
      gemini: "no",
      copilot: "no",
    })
    const config = argsToConfig(args)

    // then
    expect(args.platform).toBeUndefined()
    expect(config.hasCodex).toBe(false)
    expect(config.hasOpenCode).toBe(true)
  })

  test("leaves unset invocation unresolved so argsToConfig applies opencode default", () => {
    // given
    delete process.env.OMC_INVOCATION_NAME

    // when
    const args = resolveInstallArgs(
      {
        tui: false,
        claude: "no",
        gemini: "no",
        copilot: "no",
      },
      undefined,
    )
    const config = argsToConfig(args)

    // then
    expect(args.platform).toBeUndefined()
    expect(config.hasCodex).toBe(false)
    expect(config.hasOpenCode).toBe(true)
  })
})
