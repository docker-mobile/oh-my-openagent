/// <reference types="bun-types" />

import { describe, expect, it, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { chmod, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { linkRootRuntimeBin } from "./codex-cache-bins"
import { windowsCommandShim } from "./codex-cache-command-shim"
import { windowsRuntimeWrapper } from "./codex-cache-runtime-wrapper"

const STANDALONE_OMO_BINARY = Buffer.concat([
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.alloc(1024),
  Buffer.from('var RUNTIME_WRAPPER_MARKER = "OMC_GENERATED_RUNTIME_WRAPPER";\n'),
])

async function createRepoFixture(): Promise<{ repoRoot: string; binDir: string; codexHome: string }> {
  const root = mkdtempSync(join(tmpdir(), "omc-codex-cache-bins-"))
  const repoRoot = join(root, "repo")
  await mkdir(join(repoRoot, "dist", "cli"), { recursive: true })
  await writeFile(join(repoRoot, "dist", "cli", "index.js"), "")
  return { repoRoot, binDir: join(root, "bin"), codexHome: join(root, "codex") }
}

describe("linkRootRuntimeBin runtime wrapper parity", () => {
  it("#given posix platform #when writing the canonical runtime wrapper #then uses the new name, marker, and edition exports", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    expect(link).not.toBeNull()
    expect(link?.name).toBe("omc-agent-toolkit")
    expect(link?.path).toBe(join(fixture.binDir, "omc-agent-toolkit"))
    const wrapper = await readFile(link?.path ?? "", "utf8")
    expect(wrapper).toContain("OMC_GENERATED_RUNTIME_WRAPPER")
    expect(wrapper).toContain("export OMC_INVOCATION_NAME=omc-agent-toolkit")
    expect(wrapper).toContain("export OMC_EDITION=codex")
    await expect(lstat(join(fixture.binDir, "omc"))).rejects.toThrow()
  })

  it("#given a marker-bearing legacy omc wrapper #when writing the canonical wrapper #then deletes the legacy wrapper", async () => {
    // given
    const fixture = await createRepoFixture()
    await mkdir(fixture.binDir, { recursive: true })
    await writeFile(join(fixture.binDir, "omc"), "#!/bin/sh\n# OMC_GENERATED_RUNTIME_WRAPPER\n")

    // when
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    await expect(lstat(join(fixture.binDir, "omc"))).rejects.toThrow()
    expect(await readFile(join(fixture.binDir, "omc-agent-toolkit"), "utf8")).toContain("OMC_GENERATED_RUNTIME_WRAPPER")
  })

  it("#given an unmarked user-owned omc #when writing the canonical wrapper twice #then preserves omc byte-identical and remains idempotent", async () => {
    // given
    const fixture = await createRepoFixture()
    const legacyPath = join(fixture.binDir, "omc")
    const canonicalPath = join(fixture.binDir, "omc-agent-toolkit")
    const userContent = Buffer.from("#!/bin/sh\nprintf 'user-owned omc\\n'\n")
    await mkdir(fixture.binDir, { recursive: true })
    await writeFile(legacyPath, userContent)

    // when
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })
    const firstCanonical = await readFile(canonicalPath)
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    expect(await readFile(legacyPath)).toEqual(userContent)
    expect(await readFile(canonicalPath)).toEqual(firstCanonical)
  })

  it("#given win32 platform #when writing the canonical runtime wrapper #then uses the new name and environment exports", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "win32" })

    // then
    expect(link?.name).toBe("omc-agent-toolkit")
    expect(link?.path).toBe(join(fixture.binDir, "omc-agent-toolkit.cmd"))
    const wrapper = await readFile(link?.path ?? "", "utf8")
    expect(wrapper).toContain("rem OMC_GENERATED_RUNTIME_WRAPPER")
    expect(wrapper).toContain('set "OMC_INVOCATION_NAME=omc-agent-toolkit"')
    expect(wrapper).toContain('set "OMC_EDITION=codex"')
    await expect(lstat(join(fixture.binDir, "omc.cmd"))).rejects.toThrow()
  })

  it("#given posix platform #when writing the omc-agent-toolkit runtime wrapper #then embeds the node fallback chain", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    expect(link).not.toBeNull()
    const wrapper = await readFile(link?.path ?? "", "utf8")
    expect(wrapper).toContain("OMC_RUNTIME")
    expect(wrapper).toMatch(/dist[\\/]cli-node[\\/]index\.js/)
    expect(wrapper).toContain("exec node")
    expect(wrapper.indexOf("OMC_RUNTIME")).toBeLessThan(wrapper.indexOf("command -v bun"))
  })

  it("#given posix platform #when bun is absent everywhere #then the wrapper falls back to node before exiting 127", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    const wrapper = await readFile(link?.path ?? "", "utf8")
    const bunMissingBranch = wrapper.slice(wrapper.lastIndexOf('if [ -z "$BUN_BINARY" ]'))
    expect(bunMissingBranch).toContain("exec node")
    expect(bunMissingBranch).toContain("OMC_RUNTIME=node")
    expect(bunMissingBranch).toContain("exit 127")
  })

  it("#given win32 platform #when writing the omc runtime wrapper #then embeds the node fallback chain", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "win32" })

    // then
    expect(link).not.toBeNull()
    const wrapper = await readFile(link?.path ?? "", "utf8")
    expect(wrapper).toContain("OMC_RUNTIME")
    expect(wrapper).toMatch(/dist[\\/]cli-node[\\/]index\.js/)
    expect(wrapper.indexOf("OMC_RUNTIME")).toBeLessThan(wrapper.indexOf("where bun"))
    expect(wrapper).toContain("exit /b 127")
  })

  it("#given win32 platform #when writing the omc runtime wrapper #then discovers Codex bundled Node from config before bare node", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "win32" })

    // then
    expect(link).not.toBeNull()
    const wrapper = await readFile(link?.path ?? "", "utf8")
    expect(wrapper).toContain('for /f "tokens=1,* delims==" %%A in (\'findstr /R /C:"NODE_REPL_NODE_PATH[ ]*=" "%CODEX_HOME%\\config.toml" 2^>nul\') do (')
    expect(wrapper).toContain('set "OMC_NODE_BINARY=!OMC_NODE_BINARY:"=!"')
    expect(wrapper).toContain(`if "!OMC_NODE_BINARY:~0,1!"=="'" set "OMC_NODE_BINARY=!OMC_NODE_BINARY:~1!"`)
    expect(wrapper).toContain('if "%OMC_RUNTIME%"=="node" if defined OMC_NODE_BINARY if exist "')
    expect(wrapper.indexOf("NODE_REPL_NODE_PATH")).toBeLessThan(wrapper.indexOf('if "%OMC_RUNTIME%"=="node"'))
    expect(wrapper).toContain('"%OMC_NODE_BINARY%" "')
    expect(wrapper).not.toContain('  node "')
  })

  const posixOnly = process.platform === "win32" ? test.skip : test
  const windowsOnly = process.platform === "win32" ? test : test.skip
  windowsOnly("#given NODE_REPL_NODE_PATH quoted in config.toml #when cmd runs the generated shim #then it reaches the target", async () => {
    // given
    const root = mkdtempSync(join(tmpdir(), "omc-codex-cmd-shim-"))
    const codexHome = join(root, "codex")
    await mkdir(codexHome, { recursive: true })
    await writeFile(join(codexHome, "config.toml"), `NODE_REPL_NODE_PATH = "${process.execPath.replaceAll("\\", "\\\\")}"\n`)
    const target = join(root, "target.js")
    await writeFile(target, 'console.log("SHIM_REACHED")\n')
    const shim = join(root, "probe.cmd")
    await writeFile(shim, windowsCommandShim(target))

    // when
    const child = Bun.spawn(["cmd.exe", "/d", "/c", shim], { env: { ...Bun.env, CODEX_HOME: codexHome }, stderr: "pipe", stdout: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])

    // then
    expect(stderr).not.toContain("syntax of the command is incorrect")
    expect(stdout).toContain("SHIM_REACHED")
    expect(exitCode).toBe(0)
    await rm(root, { recursive: true, force: true })
  })

  windowsOnly("#given a runtime target path holding %VAR% text, !, ^ and parentheses #when cmd runs the generated wrapper #then it runs that literal path (#12811)", async () => {
    // given
    const root = mkdtempSync(join(tmpdir(), "omc-codex-cmd-escape-"))
    const codexHome = join(root, "odd %TEMP% !bang^ (x)", ".codex")
    const cliPath = join(codexHome, "plugins", "cache", "sisyphuslabs", "omc", "1.0.0", "dist", "cli", "index.js")
    await mkdir(dirname(cliPath), { recursive: true })
    await writeFile(cliPath, 'console.log("WRAPPER_REACHED " + process.argv.slice(2).join(" "))\n')
    const wrapper = join(root, "omc-agent-toolkit.cmd")
    await writeFile(wrapper, windowsRuntimeWrapper("omc-agent-toolkit", cliPath, codexHome, root, join(dirname(cliPath), "..", "cli-node", "index.js")))

    // when
    const child = Bun.spawn(["cmd.exe", "/d", "/c", wrapper, "probe"], { env: { ...Bun.env, BUN_BINARY: process.execPath, CODEX_HOME: codexHome }, stderr: "pipe", stdout: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])

    // then
    expect(stderr).not.toContain("runtime target missing")
    expect(stdout).toContain("WRAPPER_REACHED probe")
    expect(exitCode).toBe(0)
    await rm(root, { recursive: true, force: true })
  })

  posixOnly("#given posix wrapper target was removed #when running omc #then exits with reinstall guidance", async () => {
    // given
    const fixture = await createRepoFixture()
    const link = await linkRootRuntimeBin({ ...fixture, platform: "linux" })
    if (link === null) throw new Error("expected runtime wrapper link")
    await chmod(link.path, 0o755)
    await rm(join(fixture.repoRoot, "dist", "cli", "index.js"))

    // when
    const process = Bun.spawn([link.path], { env: { ...Bun.env, BUN_BINARY: "bun" }, stderr: "pipe", stdout: "pipe" })
    const [stderr, exitCode] = await Promise.all([new Response(process.stderr).text(), process.exited])

    // then
    expect(exitCode).toBe(1)
    expect(stderr).toContain(`omc-agent-toolkit: runtime target missing at ${join(fixture.repoRoot, "dist", "cli", "index.js")}`)
    expect(stderr).toContain("reinstall with: npx --yes lazycodex-ai@latest install --no-tui")
  })

  posixOnly("#given ulw-loop command #when running omc wrapper #then preserves the ulw-loop token", async () => {
    // given
    const fixture = await createRepoFixture()
    const link = await linkRootRuntimeBin({ ...fixture, platform: "linux" })
    if (link === null) throw new Error("expected runtime wrapper link")
    await chmod(link.path, 0o755)
    await mkdir(fixture.binDir, { recursive: true })
    const ulwLoopBin = join(fixture.binDir, "omc-ulw-loop")
    await writeFile(ulwLoopBin, "#!/bin/sh\nprintf '%s\\n' \"$*\"\n")
    await chmod(ulwLoopBin, 0o755)

    // when
    const process = Bun.spawn([link.path, "ulw-loop", "help"], { env: { ...Bun.env }, stderr: "pipe", stdout: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])

    // then
    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    expect(stdout.trim()).toBe("ulw-loop help")
  })

  it("#given win32 wrapper target was removed #when writing omc.cmd #then it contains reinstall guidance before bun exec", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "win32" })

    // then
    if (link === null) throw new Error("expected runtime wrapper link")
    const wrapper = await readFile(link.path, "utf8")
    const guardIndex = wrapper.indexOf("runtime target missing")
    expect(guardIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeLessThan(wrapper.indexOf('"%BUN_BINARY%"'))
    expect(wrapper).toContain("reinstall with: npx --yes lazycodex-ai@latest install --no-tui")
  })

  it("#given win32 ulw-loop command #when writing omc.cmd #then preserves the ulw-loop token", async () => {
    // given
    const fixture = await createRepoFixture()

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "win32" })

    // then
    if (link === null) throw new Error("expected runtime wrapper link")
    const wrapper = await readFile(link.path, "utf8")
    expect(wrapper).toMatch(/"[^"\r\n]*omc-ulw-loop\.cmd" ulw-loop %\*/)
  })
})

describe("legacy omc reclamation across link kinds", () => {
  it("#given bin/omc is a symlink resolving to a marker-bearing wrapper #when writing the canonical wrapper #then removes the symlink and keeps its target", async () => {
    // given
    const fixture = await createRepoFixture()
    await mkdir(fixture.binDir, { recursive: true })
    const target = join(fixture.repoRoot, "generated-wrapper.sh")
    await writeFile(target, "#!/bin/sh\n# OMC_GENERATED_RUNTIME_WRAPPER\necho stale\n")
    await symlink(target, join(fixture.binDir, "omc"))

    // when
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    await expect(lstat(join(fixture.binDir, "omc"))).rejects.toThrow()
    expect(await readFile(target, "utf8")).toContain("OMC_GENERATED_RUNTIME_WRAPPER")
  })

  it("#given bin/omc is a symlink to an unmarked user file #when writing the canonical wrapper #then preserves the symlink", async () => {
    // given
    const fixture = await createRepoFixture()
    await mkdir(fixture.binDir, { recursive: true })
    const target = join(fixture.repoRoot, "my-own-script.sh")
    await writeFile(target, "#!/bin/sh\necho mine\n")
    await symlink(target, join(fixture.binDir, "omc"))

    // when
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    const entry = await lstat(join(fixture.binDir, "omc"))
    expect(entry.isSymbolicLink()).toBe(true)
  })

  it("#given bin/omc is a dangling symlink #when writing the canonical wrapper #then completes without throwing", async () => {
    // given
    const fixture = await createRepoFixture()
    await mkdir(fixture.binDir, { recursive: true })
    await symlink(join(fixture.repoRoot, "missing-target.sh"), join(fixture.binDir, "omc"))

    // when
    const link = await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    expect(link?.name).toBe("omc-agent-toolkit")
  })

  it("#given bin/omc is a standalone omc binary embedding the marker past its header #when writing the canonical wrapper #then preserves it byte-identical", async () => {
    // given: the standalone omc build bundles this installer, so the marker string sits in its payload
    const fixture = await createRepoFixture()
    await mkdir(fixture.binDir, { recursive: true })
    const legacyPath = join(fixture.binDir, "omc")
    await writeFile(legacyPath, STANDALONE_OMO_BINARY)

    // when
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    expect(await readFile(legacyPath)).toEqual(STANDALONE_OMO_BINARY)
  })

  it("#given bin/omc is a symlink to a standalone omc binary embedding the marker #when writing the canonical wrapper #then preserves the symlink", async () => {
    // given
    const fixture = await createRepoFixture()
    await mkdir(fixture.binDir, { recursive: true })
    const target = join(fixture.repoRoot, "omc-standalone")
    await writeFile(target, STANDALONE_OMO_BINARY)
    await symlink(target, join(fixture.binDir, "omc"))

    // when
    await linkRootRuntimeBin({ ...fixture, platform: "linux" })

    // then
    const entry = await lstat(join(fixture.binDir, "omc"))
    expect(entry.isSymbolicLink()).toBe(true)
  })
})
