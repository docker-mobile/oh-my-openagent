import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const CLI = resolve(import.meta.dir, "cli.ts")

let workdir: string

interface CliRun {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

async function omc(...args: string[]): Promise<CliRun> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd: workdir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "omc-cli-"))
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
})

describe("omc-engagement cli", () => {
  test("#given no engagement #when a fact is recorded #then it exits non-zero with an explanation", async () => {
    const run = await omc("fact", "10.0.0.5", "--kind", "host")

    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/no engagement/)
  })

  test("#given an engagement #when a typed fact is recorded #then an id is printed", async () => {
    expect((await omc("init", "own the target")).code).toBe(0)
    const fact = await omc("fact", "10.0.0.5", "--kind", "host", "--data", "ip=10.0.0.5")

    expect(fact.code).toBe(0)
    expect(fact.stdout).toMatch(/f\d+/)
  })

  test("#given a recorded fact #when an intent depends on it #then the frontier reports it ready", async () => {
    await omc("init", "goal")
    const factId = (await omc("fact", "alive host", "--kind", "host")).stdout.match(/f\d+/)?.[0] as string

    expect((await omc("intent", "scan it", "--from", factId)).code).toBe(0)
    const frontier = await omc("frontier")
    expect(frontier.stdout).toContain("scan it")
  })

  test("#given an unknown kind #when a fact is recorded #then it is refused with the allowed set", async () => {
    await omc("init", "goal")
    const run = await omc("fact", "x", "--kind", "not-a-kind")

    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/unknown fact kind/)
  })

  test("#given a finding #when recorded #then a stable id is printed", async () => {
    await omc("init", "goal")
    const run = await omc("finding", "path traversal", "--severity", "critical", "--target", "10.0.0.5", "--cve", "CVE-2021-41773")

    expect(run.code).toBe(0)
    expect(run.stdout).toMatch(/v\d+/)
  })

  test("#given a malformed CVE #when a finding is recorded #then it is refused", async () => {
    await omc("init", "goal")
    const run = await omc("finding", "x", "--severity", "high", "--target", "t", "--cve", "nope")

    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/malformed CVE/)
  })

  test("#given an unknown tool #when run #then it is refused and names the known adapters", async () => {
    const run = await omc("run", "definitely-not-a-tool", "10.0.0.5")

    expect(run.code).toBe(2)
    expect(run.stderr).toMatch(/unknown tool/)
    expect(run.stderr).toContain("nmap")
  })

  test("#given a target with shell syntax #when run through an adapter #then it is refused before spawning", async () => {
    const run = await omc("run", "nmap", "10.0.0.5; whoami")

    expect(run.code).toBe(1)
    expect(run.stderr).toMatch(/metacharacter/)
  })

  test("#given an adapter whose binary is absent #when run #then it reports not-found instead of pretending to scan", async () => {
    const run = await omc("run", "nuclei", "127.0.0.1")

    expect(run.code).toBe(1)
    expect(run.stdout).toMatch(/^not-found\tnuclei\t/)
    expect(run.stderr).toMatch(/nothing was scanned/)
  })

  test("#given an unknown command #when invoked #then usage is refused", async () => {
    const run = await omc("frobnicate")

    expect(run.code).toBe(2)
    expect(run.stderr).toMatch(/unknown command/)
  })

  test("#given no arguments #when invoked #then the command surface is printed", async () => {
    const run = await omc()

    expect(run.code).toBe(0)
    expect(run.stdout).toContain("fact")
    expect(run.stdout).toContain("finding")
  })

  test("#given an engagement with facts #when status is read #then counts are reported", async () => {
    await omc("init", "goal")
    await omc("fact", "one", "--kind", "host")
    await omc("fact", "two", "--kind", "vuln")

    const run = await omc("status")
    const payload = JSON.parse(run.stdout) as { facts: number; goal: string }
    expect(payload.facts).toBe(2)
    expect(payload.goal).toBe("goal")
  })

  test("#given recorded facts #when intel is read #then each kind is counted", async () => {
    await omc("init", "goal")
    await omc("fact", "host one", "--kind", "host")
    await omc("fact", "a cred", "--kind", "cred")

    const run = await omc("intel")
    const counts = JSON.parse(run.stdout) as Record<string, number>
    expect(counts.host).toBe(1)
    expect(counts.cred).toBe(1)
    expect(counts.loot).toBe(0)
  })
})
