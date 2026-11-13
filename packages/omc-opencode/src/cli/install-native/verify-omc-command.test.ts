/// <reference types="bun-types" />

import { rmSync } from "node:fs"
import { afterEach, describe, expect, test } from "bun:test"
import { verifyOmoCommand } from "./verify-omc-command"
import { createBinFixtureRoot, writeGlobalPackageBin } from "./omc-bin-test-fixtures"

const roots: string[] = []

function root(label: string): string {
  const created = createBinFixtureRoot(label)
  roots.push(created)
  return created
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true })
})

function environmentOf(pathDirectories: readonly string[], extraDirectories: readonly string[] = []) {
  return { pathDirectories, extraDirectories, isWindows: false }
}

function probeReturning(result: { exitCode: number; stdout: string }) {
  const calls: { command: string; args: readonly string[] }[] = []
  const probeVersion = async (command: string, args: readonly string[]) => {
    calls.push({ command, args })
    return result
  }
  return { calls, probeVersion }
}

describe("verifyOmoCommand", () => {
  test("#given omc-ai resolves first #when verifying #then it probes that exact bin and passes", async () => {
    // given
    const bun = writeGlobalPackageBin({ root: root("verify-ok"), packageName: "omc-ai", version: "5.0.0-0.beta.89" })
    const { calls, probeVersion } = probeReturning({
      exitCode: 0,
      stdout: "omc 5.0.0-0.beta.89 (engine: senpi 0.9.1)\n",
    })

    // when
    const verification = await verifyOmoCommand({ environment: environmentOf([bun.binDir]), probeVersion })

    // then
    expect(calls).toEqual([{ command: bun.binPath, args: ["--version"] }])
    expect(verification.ok).toBe(true)
    expect(verification.warnings).toEqual([])
    expect(verification.notes.join("\n")).toContain("omc 5.0.0-0.beta.89")
  })

  test("#given another omc still resolves first #when verifying #then it fails with the PATH-order fix", async () => {
    // given
    const npm = writeGlobalPackageBin({ root: root("verify-shadow"), packageName: "oh-my-cybersecurity", version: "4.19.4" })
    const bun = writeGlobalPackageBin({ root: root("verify-shadowed"), packageName: "omc-ai", version: "5.0.0-0.beta.89" })
    const { probeVersion } = probeReturning({ exitCode: 0, stdout: "4.19.4\n" })

    // when
    const verification = await verifyOmoCommand({
      environment: environmentOf([npm.binDir, bun.binDir]),
      probeVersion,
    })

    // then
    expect(verification.ok).toBe(false)
    const warning = verification.warnings.join("\n")
    expect(warning).toContain("oh-my-cybersecurity")
    expect(warning).toContain(npm.binPath)
    expect(warning).toContain(`export PATH="${bun.binDir}:$PATH"`)
  })

  test("#given omc-ai landed in a directory that is not on PATH #when verifying #then it fails with the PATH fix for that directory", async () => {
    // given
    const bun = writeGlobalPackageBin({ root: root("verify-offpath"), packageName: "omc-ai", version: "5.0.0-0.beta.89" })
    const { calls, probeVersion } = probeReturning({ exitCode: 0, stdout: "omc 5.0.0-0.beta.89\n" })

    // when
    const verification = await verifyOmoCommand({ environment: environmentOf([], [bun.binDir]), probeVersion })

    // then
    expect(verification.ok).toBe(false)
    expect(calls).toEqual([])
    expect(verification.warnings.join("\n")).toContain(`export PATH="${bun.binDir}:$PATH"`)
  })

  test("#given the omc command itself fails #when verifying #then the output is reported", async () => {
    // given
    const bun = writeGlobalPackageBin({ root: root("verify-broken"), packageName: "omc-ai", version: "5.0.0-0.beta.89" })
    const { probeVersion } = probeReturning({ exitCode: 1, stdout: "omc: engine missing\n" })

    // when
    const verification = await verifyOmoCommand({ environment: environmentOf([bun.binDir]), probeVersion })

    // then
    expect(verification.ok).toBe(false)
    expect(verification.warnings.join("\n")).toContain("omc: engine missing")
  })

  test("#given no omc command anywhere #when verifying #then it reports the missing command instead of passing", async () => {
    // given
    const empty = root("verify-empty")
    const { probeVersion } = probeReturning({ exitCode: 0, stdout: "" })

    // when
    const verification = await verifyOmoCommand({ environment: environmentOf([empty]), probeVersion })

    // then
    expect(verification.ok).toBe(false)
    expect(verification.warnings.join("\n")).toContain("omc")
  })
})
