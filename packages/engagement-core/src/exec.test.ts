import { describe, expect, test } from "bun:test"

import {
  DEFAULT_EXEC_TIMEOUT_MS,
  ExecError,
  MAX_EXEC_TIMEOUT_MS,
  assertNoShellMeta,
  createSubprocessRunner,
  resolveTimeout,
  runAdapter,
  type Runner,
} from "./exec"

describe("exec boundary", () => {
  test("#given a command carrying a shell metacharacter #when validated #then it is refused", () => {
    expect(() => assertNoShellMeta("nmap; rm -rf /", "cmd")).toThrow(ExecError)
    expect(() => assertNoShellMeta("nmap | tee x", "cmd")).toThrow(/metacharacter/)
    expect(() => assertNoShellMeta("nmap && whoami", "cmd")).toThrow(ExecError)
    expect(() => assertNoShellMeta("$(whoami)", "cmd")).toThrow(ExecError)
    expect(() => assertNoShellMeta("`id`", "cmd")).toThrow(ExecError)
  })

  test("#given a benign command and argument #when validated #then it passes", () => {
    expect(() => assertNoShellMeta("nmap", "cmd")).not.toThrow()
    expect(() => assertNoShellMeta("-sV", "argument")).not.toThrow()
    expect(() => assertNoShellMeta("10.0.0.1/24", "argument")).not.toThrow()
  })

  test("#given no timeout #when resolved #then the default bound applies", () => {
    expect(resolveTimeout(undefined)).toBe(DEFAULT_EXEC_TIMEOUT_MS)
    expect(resolveTimeout(0)).toBe(DEFAULT_EXEC_TIMEOUT_MS)
    expect(resolveTimeout(-5)).toBe(DEFAULT_EXEC_TIMEOUT_MS)
  })

  test("#given an absurd timeout #when resolved #then it is capped well below infinity", () => {
    expect(resolveTimeout(99 * 60 * 60 * 1000)).toBe(MAX_EXEC_TIMEOUT_MS)
    expect(resolveTimeout(1000)).toBe(1000)
  })

  test("#given a real command #when run #then stdout and the exit code are captured", async () => {
    const runner = createSubprocessRunner()
    const result = await runner.run({ cmd: "echo", args: ["engagement-ok"] })

    expect(result.outcome).toBe("ok")
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("engagement-ok")
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  test("#given a non-zero exit #when run #then it is reported as failed with the code, not thrown", async () => {
    const runner = createSubprocessRunner()
    const result = await runner.run({ cmd: "sh", args: ["-c", "exit 3"] })

    expect(result.outcome).toBe("failed")
    expect(result.exitCode).toBe(3)
  })

  test("#given a missing binary #when run #then it is reported as not-found, not a crash", async () => {
    const runner = createSubprocessRunner()
    const result = await runner.run({ cmd: "definitely-not-a-real-binary-omc" })

    expect(result.outcome).toBe("not-found")
    expect(result.exitCode).toBeNull()
  })

  test("#given a command that outlives its timeout #when run #then it is killed and reported as timeout", async () => {
    const runner = createSubprocessRunner()
    const result = await runner.run({ cmd: "sleep", args: ["30"], timeoutMs: 250 })

    expect(result.outcome).toBe("timeout")
    expect(result.durationMs).toBeLessThan(10_000)
  })

  test("#given stdin #when supplied #then the child receives it", async () => {
    const runner = createSubprocessRunner()
    const result = await runner.run({ cmd: "cat", stdin: "piped-payload" })

    expect(result.stdout).toBe("piped-payload")
  })

  test("#given an adapter #when run through it #then argv comes from the adapter, not the caller", async () => {
    const seen: string[][] = []
    const fake: Runner = {
      async run(options) {
        seen.push([options.cmd, ...(options.args ?? [])])
        return {
          outcome: "ok",
          command: options.cmd,
          argv: [options.cmd, ...(options.args ?? [])],
          exitCode: 0,
          stdout: "banner",
          stderr: "",
          durationMs: 1,
        }
      },
    }

    const adapter = {
      name: "nmap",
      binary: "nmap",
      buildArgs: (target: string) => ["-sV", "-oX", "-", target],
    }

    const result = await runAdapter(adapter, "10.0.0.5", fake)
    expect(seen[0]).toEqual(["nmap", "-sV", "-oX", "-", "10.0.0.5"])
    expect(result.tool).toBe("nmap")
    expect(result.result.stdout).toBe("banner")
  })

  test("#given an adapter and a target with shell syntax #when run #then it is refused before spawning", async () => {
    let spawned = false
    const fake: Runner = {
      async run(options) {
        spawned = true
        throw new ExecError(`should not run: ${options.cmd}`)
      },
    }
    const adapter = { name: "nmap", binary: "nmap", buildArgs: (t: string) => [t] }

    await expect(runAdapter(adapter, "10.0.0.5; whoami", fake)).rejects.toThrow(/metacharacter/)
    expect(spawned).toBe(false)
  })

  test("#given a runner #when invoked with an empty command #then it refuses", async () => {
    const runner = createSubprocessRunner()
    await expect(runner.run({ cmd: "   " })).rejects.toThrow(ExecError)
  })
})
