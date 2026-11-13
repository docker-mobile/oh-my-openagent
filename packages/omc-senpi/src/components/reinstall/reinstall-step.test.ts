import { describe, expect, test } from "bun:test"

import { reinstallStep } from "./reinstall-step"

// Contract: omc-native's launcher sets OMC_REINSTALL_COMMAND (engine-environment.js, pinned by launcher.test.ts);
// the plugin names exactly that command, and nothing when another launch left it unset.
describe("reinstallStep", () => {
  test.each(["bun add -g omc-ai@beta", "bun add -g omc-ai", "npm i -g omc-ai@beta", "npm i -g omc-ai"])("#given the launcher's command %s #then the step carries that exact command", (command) => {
    expect(reinstallStep({ OMC_REINSTALL_COMMAND: command }).split(": ")[1]).toBe(command)
  })

  test("#given no or a blank OMC_REINSTALL_COMMAND #then no command is named", () => {
    expect(reinstallStep({})).not.toContain(":")
    expect(reinstallStep({ OMC_REINSTALL_COMMAND: "  " })).not.toContain(":")
  })
})
