import { spawnSync } from "node:child_process"
import { existsSync, realpathSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { pathToFileURL } from "node:url"
import { isEngineCommand } from "./engine-commands.js"
import { spawnNode } from "./child-process.js"
import { privateFdHandoff } from "./private-fds.js"
import { launchClaimsMemorySyncAtBoot } from "./memory-sync-boot.js"
import { doctorCoverageLines } from "./category-coverage.js"
import { runDoctorModels } from "./model-chains.js"
import { doctorComputerUseLines } from "./computer-use-doctor.js"
import { doctorConfigLines } from "./config-doctor.js"
import { runDaemonCommand } from "./daemon.js"
import { runThreadCommand } from "./thread.js"
import { isHostStatusAll, runHostStatusAll, sessionActivityReader } from "./host-status.js"
import { runDoctor } from "./doctor.js"
import { reflectionLockFix, reflectionLockReport } from "./doctor-reflection-lock.js"
import { memoryRuntimeDiscardResolver, memoryRuntimeMaxBytesResolver, memoryRuntimeReport } from "./doctor-memory-runtime.js"
import { ensureEnginePrepared, preparePluginLaunchSpec } from "./engine-prepare.js"
import { migrateLegacyBunGlobalManifest } from "./legacy-bun-global-migration.js"
import { removeLegacyServiceCredentials } from "./legacy-service-credentials.js"
import { adoptLegacyFlatState, canonicalAgentDir, prepareAgentDirForLaunch } from "./agent-dir.js"
import { senpiEnvironment } from "./engine-environment.js"
import { withHerdrAgentHint } from "./herdr-agent-hint.js"
import { isEngineProtocolMode } from "./mode-flags.js"
import { packageManifest, packageRoot, readJson, releaseBanner, resolveSenpi, updateTarget } from "./package-paths.js"
import { runSelfUpdate } from "./self-update.js"
import { isSelfUpdate } from "./update-args.js"
import { detectHarnesses } from "./setup-detect.js"
import { readSetupSuggestionCache, spawnSetupSuggestionRefresh } from "./setup-detect-cache.js"
import { printSetupReport } from "./setup-report.js"
import { refuseRetiredCommand } from "./retired-command.js"

function engineVersion() {
  try {
    return readJson(join(resolveSenpi().packageRoot, "package.json")).version
  } catch {
    return "unknown"
  }
}

function preparedSenpi() {
  preparePluginLaunchSpec({ pluginRoot: join(packageRoot, "plugin") })
  const senpi = resolveSenpi()
  ensureEnginePrepared({
    senpiRoot: senpi.packageRoot,
    omoVersion: packageManifest().version,
    reinstallCommand: updateTarget().command,
  })
  return senpi
}

/**
 * Identity of an executable file, not the spelling that reached us: a symlink, a relative path and
 * a Windows case alias all name the same file. dev+ino answers that exactly wherever the
 * filesystem reports an inode; the case-folded real path is the fallback for the filesystems that
 * report none. A path that is not a regular file has no identity here and is rejected.
 */
function executableIdentity(candidate) {
  let real
  let stats
  try {
    real = realpathSync(candidate)
    stats = statSync(real)
  } catch {
    return undefined
  }
  if (!stats.isFile()) return undefined
  const key = stats.ino > 0 ? `${stats.dev}:${stats.ino}` : real.replaceAll("\\", "/").toLowerCase()
  return { path: real, key }
}

function launcherIdentityKeys() {
  const keys = new Set()
  for (const candidate of [process.argv[1], join(packageRoot, "bin", "omc.js")]) {
    if (!candidate) continue
    const identity = executableIdentity(candidate)
    if (identity) keys.add(identity.key)
  }
  return keys
}

/**
 * An explicit SENPI_BIN is the user's answer to which engine binary runs, so it survives the
 * scrub instead of being replaced by the packaged shim. The one value that cannot survive is a
 * path pointing back at this launcher: spawning it would re-enter omc forever, and comparing path
 * strings alone lets a symlink or a Windows case alias walk straight into that recursion.
 */
function configuredSenpiBin() {
  const configured = process.env.SENPI_BIN?.trim()
  if (!configured) return undefined
  const identity = executableIdentity(configured)
  if (identity === undefined) return undefined
  return launcherIdentityKeys().has(identity.key) ? undefined : identity.path
}

// A memory-sync launch reaches the engine through this entry, which claims before senpi's CLI loads (#11997).
const ENGINE_BOOT_ENTRY = join(packageRoot, "bin", "lib", "engine-boot.js")
const DEVICE_ACCOUNT_SIDECAR = join(packageRoot, "plugin", "extensions", "omc-device-account.js")

/** Whether a launch that hands down a private-descriptor table claims memory sync at boot (the sidecar's gate). */
async function bootsWithMemorySyncClaim(args, env) {
  try {
    const { claimsMemorySyncAtBoot } = await import(pathToFileURL(DEVICE_ACCOUNT_SIDECAR).href)
    // spawnNode starts the engine entry on this runtime without exec arguments; engine-boot.js checks again in-process.
    return launchClaimsMemorySyncAtBoot(args, env, claimsMemorySyncAtBoot, { execArgv: [], versions: process.versions })
  } catch (error) {
    // Without the sidecar the memory component's registration still selects once when the first session opens.
    process.stderr.write(`omc: memory sync could not start at boot: ${error instanceof Error ? error.message : String(error)}\n`)
    return false
  }
}

async function spawnSenpi(args, withExtension) {
  const senpi = preparedSenpi()
  const finalArgs = withExtension
    ? ["--extension", join(packageRoot, "plugin"), ...args]
    : args
  const env = senpiEnvironment(senpi.packageRoot)
  if (withExtension) withHerdrAgentHint(env, args)
  const handoff = privateFdHandoff(env)
  if (handoff === undefined && process.platform !== "win32" && typeof process.execve === "function") {
    try {
      process.execve(process.execPath, [process.execPath, senpi.cliPath, ...finalArgs], env)
      return
    } catch {
      // A failed replacement still uses the signal-aware child path below.
    }
  }
  if (handoff !== undefined && await bootsWithMemorySyncClaim(finalArgs, handoff.env)) {
    await spawnNode(ENGINE_BOOT_ENTRY, [senpi.cliPath, ...finalArgs], handoff)
    return
  }
  await spawnNode(senpi.cliPath, finalArgs, handoff ?? { env })
}

// `omc remote attach`: the engine's attach TUI runs as a signal-forwarding child, never an execve replacement,
// because this process serves the endpoint the TUI is attached to until the TUI exits.
export async function runAttachTui(args) {
  const senpi = preparedSenpi()
  await spawnNode(senpi.cliPath, args, { env: senpiEnvironment(senpi.packageRoot) })
}

// Routine launch notices go straight to stderr: Bun renders every console.error line red on a
// color terminal, which made a healthy startup look like a failure (#8442).
function notice(line) {
  process.stderr.write(`${line}\n`)
}

function isInteractiveDefault(args) {
  return process.stderr.isTTY === true && !args.includes("-p") && !args.includes("--print") && !isEngineProtocolMode(args)
}

/**
 * Engine state that predates the unified directory is carried forward once, so unifying the
 * location never presents itself to the user as one more round of erased settings.
 */
function reportLegacyFlatAdoption() {
  let result
  try {
    result = adoptLegacyFlatState()
  } catch (error) {
    console.error(`omc: could not adopt legacy state: ${error.message}`)
    return
  }
  if (!result.adopted) return
  const moved = [...result.copied, ...result.backfilled].join(", ")
  notice(`omc: carried forward settings from the legacy ~/.omc layout (${moved})`)
}

/**
 * The interactive banner's sibling-credential hint is advisory, so it must never gate the engine
 * spawn. It is answered synchronously from the suggestion cache; a stale or missing cache kicks
 * off a detached refresh (the launcher itself never writes the cache) and still answers this
 * launch from the cached or empty value. Any cache failure behaves as no-siblings: fail-open.
 */
function setupSuggestionForLaunch() {
  const cached = readSetupSuggestionCache()
  if (!cached.fresh) spawnSetupSuggestionRefresh()
  return cached.suggestion === true
}

/**
 * One call into the engine's host CLI. It prints a single JSON line and exits, so the output is
 * captured rather than inherited - `omc daemon` has to read the engine's answer to turn it into
 * an exit code, and `spawnSync` is honest about a call that is expected to be this short.
 */
export function engineHostCall(engineArgs, options) {
  const senpi = preparedSenpi()
  const result = spawnSync(process.execPath, [senpi.cliPath, ...engineArgs], {
    encoding: "utf8",
    env: senpiEnvironment(senpi.packageRoot, options.env),
    windowsHide: true,
  })
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

export function rollbackMigrateCall(request) {
  const runtime = join(packageRoot, "plugin", "runtime", "rollback-migrate.js")
  const result = spawnSync(process.execPath, [runtime], {
    encoding: "utf8",
    input: JSON.stringify(request),
    env: senpiEnvironment(preparedSenpi().packageRoot),
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `rollback migration runtime exited ${result.status ?? 1}`)
  }
  return JSON.parse(result.stdout)
}

export async function runLauncher(args = process.argv.slice(2)) {
  migrateLegacyBunGlobalManifest()
  removeLegacyServiceCredentials()
  // Before the engine can create the agent dir with the umask, which the RPC socket host refuses (#12546).
  prepareAgentDirForLaunch()
  reportLegacyFlatAdoption()
  const command = args[0]
  // The toolkit CLI is no longer part of the Native payload; the loop is driven in-process by the
  // eval SDK the extension publishes. Report that plainly instead of failing on a missing file.
  if (command === "ulw-loop") {
    console.error('omc ulw-loop is unavailable in this build: use the agent toolkit SDK from an eval js cell: const { agentToolkit } = await import(`${env("OMC_AGENT_TOOLKIT_SDK_ROOT")}/sdk.js`); print(await agentToolkit.status()) (Codex keeps the standalone CLI).')
    process.exitCode = 2
    return
  }
  if (command === "thread") {
    process.exitCode = await runThreadCommand(args.slice(1), {
      engine: { run: engineHostCall },
      reinstall: `Reinstall omc with: ${updateTarget().command}, then retry.`,
      pluginRoot: join(packageRoot, "plugin"),
      agentDir: canonicalAgentDir(),
      env: process.env,
      cwd: process.cwd(),
      stdout: process.stdout,
      stderr: process.stderr,
      platform: process.platform,
    })
    return
  }
  // The daemon is the engine's to run; omc only supplies the launch spec, the task settings from
  // the omc config (daemon-config.js), and an exit code the caller can branch on.
  if (command === "daemon") {
    const outcome = await runDaemonCommand(args.slice(1), {
      engine: { run: engineHostCall },
      migration: { run: rollbackMigrateCall },
      pluginRoot: join(packageRoot, "plugin"),
      agentDir: canonicalAgentDir(),
      env: process.env,
      stdout: process.stdout,
      stderr: process.stderr,
      platform: process.platform,
    })
    // `omc daemon adopt`: the host released the session, so it resumes here as a normal launch, in its own directory.
    if (typeof outcome === "object" && Array.isArray(outcome.launch)) {
      if (typeof outcome.cwd === "string" && existsSync(outcome.cwd)) process.chdir(outcome.cwd)
      await spawnSenpi(outcome.launch, true)
      return
    }
    process.exitCode = outcome
    return
  }
  if (command === "doctor") {
    // Doctor is a launch too: it reports only what the launch-time preparation could not fix.
    preparePluginLaunchSpec({ pluginRoot: join(packageRoot, "plugin") })
    if (args[1] === "--models") {
      process.exitCode = await runDoctorModels(args.slice(2), { agentDir: canonicalAgentDir() })
      return
    }
    if (args[1] === "--fix") {
      const extra = args.slice(2).filter((arg) => arg !== "--dry-run")
      if (extra.length > 0) {
        console.log(`FAIL unknown argument ${JSON.stringify(extra[0])}: omc doctor --fix [--dry-run]`)
        process.exitCode = 1
        return
      }
      const result = await reflectionLockFix({ dryRun: args.includes("--dry-run") })
      console.log(result.lines.join("\n"))
      process.exitCode = result.failed ? 1 : 0
      return
    }
    const [categoryCoverage, computerUse, configDiagnostics, reflectionLock, memoryRuntime] = args[1] === "--reap"
      ? [[], [], [], [], []]
      : await Promise.all([
          doctorCoverageLines({ agentDir: canonicalAgentDir() }),
          doctorComputerUseLines(),
          doctorConfigLines(),
          reflectionLockReport(),
          memoryRuntimeReport({
            maxBytesFor: memoryRuntimeMaxBytesResolver({ pluginRoot: join(packageRoot, "plugin") }),
            discardFor: memoryRuntimeDiscardResolver({ pluginRoot: join(packageRoot, "plugin") }),
          }).then((report) => report.lines, (error) => [`WARN memory runtime: unavailable: ${error instanceof Error ? error.message : String(error)}`]),
        ])
    runDoctor(await detectHarnesses(), args.slice(1), {
      daemonEngine: { run: engineHostCall },
      categoryCoverage,
      computerUse,
      configDiagnostics,
      reflectionLock,
      memoryRuntime,
    })
    return
  }
  if (command === "setup") {
    printSetupReport(await detectHarnesses())
    process.exitCode = 0
    return
  }
  if ((command === "--version" || command === "-v") && args.length === 1) {
    console.log(`omc ${packageManifest().version} (engine: senpi ${engineVersion()})`)
    process.exitCode = 0
    return
  }
  // The engine is pinned by this package, so a self-update would break the pairing; every
  // self-update spelling runs the product command instead of asking senpi to move the pin.
  if (isSelfUpdate(args)) {
    process.exitCode = await runSelfUpdate(args)
    return
  }
  if (refuseRetiredCommand(args)) return
  // `host status --all` stays the engine's answer; omc only adds each terminal row's last activity.
  if (isHostStatusAll(args, process.env)) {
    process.exitCode = await runHostStatusAll(args, {
      engine: { run: engineHostCall },
      env: process.env,
      stdout: process.stdout,
      stderr: process.stderr,
      readActivity: await sessionActivityReader(join(packageRoot, "plugin")),
    })
    return
  }
  // One-shot engine commands go over unchanged: the engine dispatches them on argv[0] (#9572).
  if (isEngineCommand(args)) {
    await spawnSenpi(args, false)
    return
  }
  if (isInteractiveDefault(args)) {
    notice(releaseBanner())
    if (process.stdout.isTTY === true && setupSuggestionForLaunch()) {
      notice("omc: sibling credentials detected; run `omc setup` to review them")
    }
  }
  await spawnSenpi(args, true)
}
