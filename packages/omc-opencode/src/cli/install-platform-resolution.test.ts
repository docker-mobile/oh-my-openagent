/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { resolveCleanupPlatform, resolveInstallArgs } from "./cli-program"

describe("install platform resolution", () => {
  test("leaves omc install without --platform unresolved for config defaults", () => {
    // given
    const invocationName = "omc"

    // when
    const args = resolveInstallArgs({ tui: true }, invocationName)

    // then
    expect(args.platform).toBeUndefined()
  })

  test("resolves explicit --platform=codex", () => {
    // given
    const invocationName = "omc"

    // when
    const args = resolveInstallArgs({ tui: true, platform: "codex" }, invocationName)

    // then
    expect(args.platform).toBe("codex")
  })

  test("preserves explicit Codex autonomous install flag", () => {
    // given
    const invocationName = "omc"

    // when
    const args = resolveInstallArgs({ tui: true, platform: "codex", codexAutonomous: true }, invocationName)

    // then
    expect(args.codexAutonomous).toBe(true)
  })

  test("resolves explicit --platform=both", () => {
    // given
    const invocationName = "omc"

    // when
    const args = resolveInstallArgs({ tui: true, platform: "both" }, invocationName)

    // then
    expect(args.platform).toBe("both")
  })

  test("rejects --platform=native-dev while the native-dev platform flag is disabled", () => {
    // given
    const invocationName = "omc"
    delete process.env.OMC_ENABLE_NATIVE_DEV_PLATFORM

    // when / then
    expect(() => resolveInstallArgs({ tui: true, platform: "native-dev" }, invocationName)).toThrow(/OMC_ENABLE_NATIVE_DEV_PLATFORM/)
  })

  test("resolves explicit --platform=native-dev when the native-dev platform flag is enabled", () => {
    // given
    const invocationName = "omc"
    process.env.OMC_ENABLE_NATIVE_DEV_PLATFORM = "1"

    try {
      // when
      const args = resolveInstallArgs({ tui: true, platform: "native-dev" }, invocationName)

      // then
      expect(args.platform).toBe("native-dev")
    } finally {
      delete process.env.OMC_ENABLE_NATIVE_DEV_PLATFORM
    }
  })

  test("resolves explicit --platform=opencode", () => {
    // given
    const invocationName = "omc"

    // when
    const args = resolveInstallArgs({ tui: true, platform: "opencode" }, invocationName)

    // then
    expect(args.platform).toBe("opencode")
  })

  test("defaults lazycodex install to codex platform", () => {
    // given
    const invocationName = "lazycodex"

    // when
    const args = resolveInstallArgs({ tui: true }, invocationName)

    // then
    expect(args.platform).toBe("codex")
  })

  test("lets lazycodex install explicitly override to both", () => {
    // given
    const invocationName = "lazycodex"

    // when
    const args = resolveInstallArgs({ tui: true, platform: "both" }, invocationName)

    // then
    expect(args.platform).toBe("both")
  })

  test("lets lazycodex install explicitly override to opencode", () => {
    // given
    const invocationName = "lazycodex"

    // when
    const args = resolveInstallArgs({ tui: true, platform: "opencode" }, invocationName)

    // then
    expect(args.platform).toBe("opencode")
  })

  test("defines Commander choices so invalid --platform values are rejected", async () => {
    // given
    const cliProgramSource = await Bun.file(new URL("./cli-program.ts", import.meta.url)).text()

    // when
    const installBlock = cliProgramSource.match(/program\s*\n\s*\.command\("install"\)([\s\S]*?)\.action\(/)

    // then
    expect(installBlock).not.toBeNull()
    expect(installBlock?.[1]).toContain('new Option("--platform <platform>"')
    expect(installBlock?.[1]).toContain(".choices(availableInstallPlatforms())")
    expect(installBlock?.[1]).toContain("--codex-autonomous")
    expect(installBlock?.[1]).toContain("--no-codex-autonomous")
  })

  test("defines root --platform so npx can pass it before install", async () => {
    // given
    const cliProgramSource = await Bun.file(new URL("./cli-program.ts", import.meta.url)).text()

    // when
    const rootBlock = cliProgramSource.match(/program\s*\n\s*\.name\("oh-my-cybersecurity"\)([\s\S]*?)\.enablePositionalOptions\(\)/)

    // then
    expect(rootBlock).not.toBeNull()
    expect(rootBlock?.[1]).toContain('new Option("--platform <platform>"')
    expect(rootBlock?.[1]).toContain(".choices(availableInstallPlatforms())")
    expect(rootBlock?.[1]).toContain(".hideHelp()")
  })
})

describe("OMC_EDITION install routing", () => {
  const originalEdition = process.env.OMC_EDITION

  const withEdition = (edition: string | undefined, run: () => void) => {
    if (edition === undefined) {
      delete process.env.OMC_EDITION
    } else {
      process.env.OMC_EDITION = edition
    }
    try {
      run()
    } finally {
      if (originalEdition === undefined) {
        delete process.env.OMC_EDITION
      } else {
        process.env.OMC_EDITION = originalEdition
      }
    }
  }

  test("OMC_EDITION=codex defaults a non-codex invocation name to the codex platform", () => {
    withEdition("codex", () => {
      // given: the codex edition marker is set by the wrapper
      // when
      const args = resolveInstallArgs({ tui: true }, "omc-agent-toolkit")

      // then
      expect(args.platform).toBe("codex")
    })
  })

  test("OMC_EDITION=codex is checked before the lazycodex name checks", () => {
    withEdition("codex", () => {
      // given: the codex edition marker is set by the wrapper
      // when
      const args = resolveInstallArgs({ tui: true }, "lazycodex")

      // then
      expect(args.platform).toBe("codex")
    })
  })

  test("explicit --platform still wins over OMC_EDITION", () => {
    withEdition("codex", () => {
      // given: the codex edition marker is set by the wrapper
      // when
      const args = resolveInstallArgs({ tui: true, platform: "opencode" }, "omc-agent-toolkit")

      // then
      expect(args.platform).toBe("opencode")
    })
  })

  test("a non-codex OMC_EDITION leaves name-based routing unchanged", () => {
    withEdition("opencode", () => {
      // when / then
      expect(resolveInstallArgs({ tui: true }, "omc-agent-toolkit").platform).toBeUndefined()
      expect(resolveInstallArgs({ tui: true }, "lazycodex-ai").platform).toBe("codex")
    })
  })

  test("unset OMC_EDITION keeps today's name-based routing exactly", () => {
    withEdition(undefined, () => {
      // when / then
      expect(resolveInstallArgs({ tui: true }, "omc-agent-toolkit").platform).toBeUndefined()
      expect(resolveInstallArgs({ tui: true }, "oh-my-cybersecurity").platform).toBeUndefined()
      expect(resolveInstallArgs({ tui: true }, "lazycodex").platform).toBe("codex")
      expect(resolveInstallArgs({ tui: true }, "lazycodex-ai").platform).toBe("codex")
    })
  })
})

describe("cleanup platform resolution", () => {
  test("defaults lazycodex cleanup to codex platform", () => {
    // given
    const invocationName = "lazycodex-ai"

    // when
    const platform = resolveCleanupPlatform({}, invocationName)

    // then
    expect(platform).toBe("codex")
  })

  test("leaves omc cleanup without --platform unresolved", () => {
    // given
    const invocationName = "omc"

    // when
    const platform = resolveCleanupPlatform({}, invocationName)

    // then
    expect(platform).toBeUndefined()
  })
})
