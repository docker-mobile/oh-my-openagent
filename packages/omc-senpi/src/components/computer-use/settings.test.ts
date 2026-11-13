import { describe, expect, test } from "bun:test"

import { resolveComputerEngineEnv, resolveOmoComputerSettings } from "./settings"

describe("computer settings bridge", () => {
  test("#given the four reserved v2 keys in omc.json #when resolved #then each reaches the tool settings", () => {
    // given: the snake_case omc.json spelling of the keys reserved for computer use v2.
    const block = { run_sandbox: "quickjs", intervention: "continue", macos_key_priming: "on", trace: true } as const

    // when
    const { runSandbox, intervention, macosKeyPriming, trace } = resolveOmoComputerSettings(block, "darwin")

    // then
    expect({ runSandbox, intervention, macosKeyPriming, trace }).toEqual({
      runSandbox: "quickjs",
      intervention: "continue",
      macosKeyPriming: "on",
      trace: true,
    })
  })

  test("#given no computer block #when resolved #then intervention continues and the other reserved keys keep today's behavior", () => {
    // when
    const { runSandbox, intervention, macosKeyPriming, trace } = resolveOmoComputerSettings(undefined, "darwin")

    // then
    expect({ runSandbox, intervention, macosKeyPriming, trace }).toEqual({
      runSandbox: "vm",
      intervention: "continue",
      macosKeyPriming: "off",
      trace: false,
    })
  })
})

test("#given direct engine settings with forbidden overrides #when resolving the child environment #then only GUI keys change and inherited values remain untouched", () => {
  // given
  const parent = { DISPLAY: ":7", WAYLAND_DISPLAY: "old", PATH: "/parent/bin", OTHER: "inherited" }
  const settings = resolveOmoComputerSettings(
    {
      env: { DISPLAY: ":98", XAUTHORITY: "${HOME}/literal", XDG_RUNTIME_DIR: "/run/user/1000", WAYLAND_DISPLAY: null },
    },
    "linux",
  )

  // when
  const env = resolveComputerEngineEnv(
    { ...settings.env, LD_PRELOAD: "/private/secret.so", PATH: "/project/bin", OTHER: null },
    parent,
  )

  // then
  expect(env).toStrictEqual({
    DISPLAY: ":98",
    XAUTHORITY: "${HOME}/literal",
    XDG_RUNTIME_DIR: "/run/user/1000",
    WAYLAND_DISPLAY: undefined,
    PATH: "/parent/bin",
    OTHER: "inherited",
  })
  expect(parent).toEqual({ DISPLAY: ":7", WAYLAND_DISPLAY: "old", PATH: "/parent/bin", OTHER: "inherited" })
})
