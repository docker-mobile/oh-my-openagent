import { spawnSync } from "node:child_process"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { builtinModules, createRequire } from "node:module"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  attachBuildMarker,
  minifyBundle,
  normalizeBuiltinImports,
} from "./build-artifact.mjs"
import { stageRuntimePersonas } from "./persona-artifacts.mjs"

export function resolveBunExecutable(platform = process.platform) {
  return platform === "win32" ? "bun.exe" : "bun"
}

export const SENPI_LOADER_ALIASES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-tui",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-ai/compat",
  "@earendil-works/pi-ai/oauth",
  "@code-yeongyu/senpi",
  "@code-yeongyu/senpi/session-worker-data",
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-agent-core",
  "@mariozechner/pi-tui",
  "@mariozechner/pi-ai",
  "@mariozechner/pi-ai/compat",
  "@mariozechner/pi-ai/oauth",
  "typebox",
  "typebox/compile",
  "typebox/value",
  "@sinclair/typebox",
  "@sinclair/typebox/compile",
  "@sinclair/typebox/value",
]

const scriptDir = dirname(fileURLToPath(import.meta.url))
const buildScriptPath = fileURLToPath(new URL("./build-extension.mjs", import.meta.url))
const pluginRoot = dirname(scriptDir)
const packageRoot = dirname(pluginRoot)
const repoRoot = join(packageRoot, "..", "..")
const entryPath = join(packageRoot, "src", "extension", "bundled-index.ts")
const outputPath = process.env.OMC_SENPI_PLUGIN_OUTPUT === undefined
  ? join(pluginRoot, "extensions", "omc.js")
  : join(process.env.OMC_SENPI_PLUGIN_OUTPUT, "extensions", "omc.js")
const taskEntryPath = join(packageRoot, "src", "extension", "omc-task.ts")
const taskOutputPath = process.env.OMC_SENPI_PLUGIN_OUTPUT === undefined ? join(pluginRoot, "extensions", "omc-task.js") : join(process.env.OMC_SENPI_PLUGIN_OUTPUT, "extensions", "omc-task.js")
const memberEntryPath = join(repoRoot, "packages", "senpi-task", "src", "team", "member-extension", "index.ts")
const memberOutputPath = process.env.OMC_SENPI_PLUGIN_OUTPUT === undefined ? join(pluginRoot, "extensions", "omc-member.js") : join(process.env.OMC_SENPI_PLUGIN_OUTPUT, "extensions", "omc-member.js")
const supervisorEntryPath = join(packageRoot, "src", "components", "memory", "worker", "memory-run-supervisor.ts")
const supervisorOutputPath = process.env.OMC_SENPI_PLUGIN_OUTPUT === undefined ? join(pluginRoot, "extensions", "memory-run-supervisor.mjs") : join(process.env.OMC_SENPI_PLUGIN_OUTPUT, "extensions", "memory-run-supervisor.mjs")
// The thread gateway's store runs in a worker thread (`new Worker(url)`), which a bundler cannot
// inline, so it ships as its own entry beside omc.js; `gateway/store.ts` resolves this name from
// its own module location and falls back to `store-worker.ts` in source.
export const GATEWAY_STORE_WORKER_NAME = "gateway-store-worker.mjs"
const gatewayStoreWorkerEntryPath = join(packageRoot, "src", "components", "thread", "gateway", "store-worker.ts")
const gatewayStoreWorkerOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", GATEWAY_STORE_WORKER_NAME)
const toolkitSdkEntryPath = join(packageRoot, "src", "extension", "agent-toolkit-sdk.ts")
const toolkitSdkOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "runtime", "agent-toolkit-sdk", "sdk.js")
const bunshinTsEntryPath = join(packageRoot, "src", "extension", "bunshin-ts-sdk.ts")
const bunshinTsOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "runtime", "bunshin-ts", "sdk.js")
// The `omc thread` CLI and connector scripts import this SDK without an agent session; it points
// the gateway store at the worker sidecar in `extensions/` (two levels up from its own file).
export const THREAD_SDK_RELATIVE_PATH = join("runtime", "thread-sdk", "sdk.js")
const threadSdkEntryPath = join(packageRoot, "src", "extension", "thread-sdk.ts")
const threadSdkOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, THREAD_SDK_RELATIVE_PATH)
const advisorRuntimeEntryPath = join(packageRoot, "src", "components", "init-deep-advisor", "runtime.ts")
const advisorRuntimeOutputPath = process.env.OMC_SENPI_PLUGIN_OUTPUT === undefined ? join(pluginRoot, "extensions", "omc-init-deep-advisor.js") : join(process.env.OMC_SENPI_PLUGIN_OUTPUT, "extensions", "omc-init-deep-advisor.js")
const sidePanelRuntimeEntryPath = join(packageRoot, "src", "components", "side-panel", "runtime.ts")
const sidePanelRuntimeOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-side-panel.js")
const onboardingScanRuntimeEntryPath = join(packageRoot, "src", "components", "onboarding", "scan-runtime.ts")
const onboardingScanRuntimeOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-onboarding-scan.js")
const computerUseEntryPath = join(packageRoot, "src", "components", "computer-use", "runtime.ts")
const computerUseOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-computer-use.js")
// The computer.run QuickJS cell runs in a worker thread, which a bundler cannot inline: its entry ships
// as its own bundle (quickjs-wasi inlined) beside omc-computer-use.js, with the engine's wasm next to it.
// `senpi-desktop-service/src/run/sandbox/quickjs.ts` resolves both names from its own module location.
const computerRunWorkerEntryPath = join(repoRoot, "packages", "senpi-desktop-service", "src", "run", "sandbox", "worker.ts")
export const COMPUTER_RUN_WORKER_NAME = "omc-computer-run-worker.mjs"
export const COMPUTER_RUN_WASM_NAME = "quickjs.wasm"
// The wasm the INSTALLED quickjs-wasi ships: the freshness check pins the staged copy to it.
export function computerRunWasmSourcePath() {
  return createRequire(join(repoRoot, "packages", "senpi-desktop-service", "package.json")).resolve(`quickjs-wasi/${COMPUTER_RUN_WASM_NAME}`)
}
const memoryDoctorEntryPath = join(packageRoot, "src", "components", "memory", "commands", "doctor-runtime.ts")
const memoryMemfsEntryPath = join(packageRoot, "src", "components", "memory", "commands", "memfs-runtime.ts")
const memoryPalaceEntryPath = join(packageRoot, "src", "components", "memory", "palace", "runtime.ts")
const deviceAccountEntryPath = join(packageRoot, "src", "components", "memory", "device-session", "account-runtime.ts")
const memoryCommandsEntryPath = join(packageRoot, "src", "components", "memory", "commands", "runtime.ts")
const sessionHistoryEntryPath = join(packageRoot, "src", "components", "onboarding", "session-history", "runtime.ts")
const recallStoreEntryPath = join(packageRoot, "src", "components", "memory", "recall-store-runtime.ts")
const deviceServiceEntryPath = join(packageRoot, "src", "components", "device-service", "runtime.ts")
const telemetryPosthogEntryPath = join(packageRoot, "src", "components", "telemetry", "posthog-runtime.ts")
const telemetryOtlpEntryPath = join(packageRoot, "src", "components", "telemetry", "otlp-runtime.ts")
// The sync engine sidecar carries the Loro runtime; its wasm is emitted beside it under this fixed name
// (the engine's loader reads it relative to its own module), so omc.js never pulls Loro in.
const memorySyncEntryPath = join(packageRoot, "src", "components", "memory", "sync-runtime.ts")
export const MEMORY_SYNC_WASM_NAME = "loro_wasm_bg.wasm"
// Every file the sync sidecar loads from beside itself; a build test fails on any undeclared asset.
export const MEMORY_SYNC_ASSET_NAMES = [MEMORY_SYNC_WASM_NAME, "CaseFolding.txt"]
// Where each asset comes from, for the freshness check.
export function memorySyncAssetSources() {
  return {
    [MEMORY_SYNC_WASM_NAME]: loroWasmSourcePath(),
    "CaseFolding.txt": join(repoRoot, "packages", "memory-core", "src", "sync", "item", "CaseFolding.txt"),
  }
}
// The wasm the INSTALLED Loro package ships: the freshness check pins the committed copy to it, so a Loro
// bump without a rebuild is reported stale instead of shipping an old binary.
export function loroWasmSourcePath() {
  return createRequire(join(repoRoot, "packages", "memory-core", "package.json")).resolve(`loro-crdt/bundler/${MEMORY_SYNC_WASM_NAME}`)
}
const threadClientEntryPath = join(packageRoot, "src", "components", "thread", "live-surface.ts")
const telemetryRecoveryEntryPath = join(packageRoot, "src", "components", "telemetry", "session-summary-recovery.ts")
const feedbackEntryPath = join(packageRoot, "src", "components", "feedback", "runtime.ts")
const desktopToolkitEntryPath = join(packageRoot, "src", "components", "desktop-toolkit", "runtime.ts")
const claimReceiptEntryPath = join(packageRoot, "src", "components", "claim-receipt", "runtime.ts")
const memoryDoctorOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-memory-doctor.js")
const memoryMemfsOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-memory-memfs.js")
const memoryPalaceOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-memory-palace.js")
const deviceAccountOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-device-account.js")
const memoryCommandsOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-memory-commands.js")
const sessionHistoryOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-session-history.js")
const recallStoreOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-recall-store.js")
const deviceServiceOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-device-service.js")
const telemetryPosthogOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-telemetry-posthog.js")
const telemetryOtlpOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-telemetry-otlp.js")
const memorySyncOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-memory-sync.js")
const threadClientOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-thread-client.js")
const telemetryRecoveryOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-telemetry-recovery.js")
const feedbackOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-feedback.js")
const desktopToolkitOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-desktop-toolkit.js")
const claimReceiptOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "extensions", "omc-claim-receipt.js")
// The computer-use prelude JSON: bundled modules read it from beside the bundle (extensions/), the
// same contract as the staged personas, so omc.js carries none of the ~29 KB of prelude text (#9113).
export const COMPUTER_PRELUDE_ASSET_NAME = "assets.generated.json"
const computerPreludeAssetSource = join(repoRoot, "packages", "senpi-desktop-prelude", "src", "assets.generated.json")
const rollbackRuntimeEntryPath = join(packageRoot, "src", "extension", "rollback-migrate-runtime.ts")
const rollbackRuntimeOutputPath = join(process.env.OMC_SENPI_PLUGIN_OUTPUT ?? pluginRoot, "runtime", "rollback-migrate.js")
const builtinModuleNames = builtinModules.filter((moduleName) => !moduleName.startsWith("_")).sort()
const externalSpecifiers = [
  "#omc-desktop-toolkit-runtime",
  "#omc-task-runtime",
  "#omc-computer-use-runtime",
  "#omc-memory-doctor-runtime",
  "#omc-memory-memfs-runtime",
  "#omc-memory-palace-runtime",
  "#omc-device-account-runtime",
  "#omc-memory-commands-runtime",
  // memory-core's lazy dream archive link repair; the plugin manifest maps it to the memory-commands sidecar.
  "#memory-completion-links",
  "#omc-session-history-runtime",
  "#omc-recall-store-runtime",
  "#omc-device-service-runtime",
  // memory-core's lazy <external_projection> renderer; the plugin manifest maps it to the recall-store sidecar.
  "#memory-external-projection",
  "#omc-telemetry-posthog-runtime",
  "#omc-telemetry-otlp-runtime",
  "#omc-memory-sync-runtime",
  "#omc-thread-client-runtime",
  "#omc-telemetry-recovery-runtime",
  // telemetry-core loads its immediate sender through this import; the plugin manifest maps it to the recovery sidecar.
  "#telemetry-immediate-send",
  "#omc-feedback-runtime",
  "#omc-claim-receipt-runtime",
  "#omc-agent-toolkit-sdk",
  "#bunshin-ts",
  ...SENPI_LOADER_ALIASES,
  ...builtinModuleNames,
  ...builtinModuleNames.map((moduleName) => `node:${moduleName}`),
]
const sdkExternalSpecifiers = [...builtinModuleNames, ...builtinModuleNames.map(name => `node:${name}`)]
const BUILD_SETTINGS = JSON.stringify({
  target: "node",
  format: "esm",
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  secondaryMinifier: "terser@5.44.0",
  loaderAliases: SENPI_LOADER_ALIASES,
})

export const extensionBuildPaths = {
  scriptDir,
  pluginRoot,
  packageRoot,
  repoRoot,
  outputPath,
  taskOutputPath,
  memberOutputPath,
  supervisorOutputPath,
  toolkitSdkOutputPath,
  bunshinTsOutputPath,
  threadSdkOutputPath,
  advisorRuntimeOutputPath,
  sidePanelRuntimeOutputPath,
  onboardingScanRuntimeOutputPath,
  rollbackRuntimeOutputPath,
  computerUseOutputPath,
  memoryDoctorOutputPath,
  memoryMemfsOutputPath,
  memoryPalaceOutputPath,
  deviceAccountOutputPath,
  memoryCommandsOutputPath,
  sessionHistoryOutputPath,
  recallStoreOutputPath,
  deviceServiceOutputPath,
  telemetryPosthogOutputPath,
  telemetryOtlpOutputPath,
  memorySyncOutputPath,
  threadClientOutputPath,
  telemetryRecoveryOutputPath,
  feedbackOutputPath,
  desktopToolkitOutputPath,
  claimReceiptOutputPath,
  gatewayStoreWorkerOutputPath,
}

// An explicit path wins; with only `outputPath` set, every sidecar lands beside it.
export function resolveOutputs(options) {
  const output = options.outputPath ?? outputPath
  const sibling = (explicit, fallback, relativePath) =>
    explicit ?? (options.outputPath === undefined ? fallback : join(dirname(output), relativePath))
  return {
    output,
    taskOutput: sibling(options.taskOutputPath, taskOutputPath, "omc-task.js"),
    memberOutput: sibling(options.memberOutputPath, memberOutputPath, "omc-member.js"),
    supervisorOutput: sibling(options.supervisorOutputPath, supervisorOutputPath, "memory-run-supervisor.mjs"),
    advisorRuntimeOutput: sibling(options.advisorRuntimeOutputPath, advisorRuntimeOutputPath, "omc-init-deep-advisor.js"),
    sidePanelRuntimeOutput: sibling(options.sidePanelRuntimeOutputPath, sidePanelRuntimeOutputPath, "omc-side-panel.js"),
    onboardingScanRuntimeOutput: sibling(options.onboardingScanRuntimeOutputPath, onboardingScanRuntimeOutputPath, "omc-onboarding-scan.js"),
    toolkitSdkOutput: sibling(options.toolkitSdkOutputPath, toolkitSdkOutputPath, join("runtime", "agent-toolkit-sdk", "sdk.js")),
    bunshinTsOutput: sibling(options.bunshinTsOutputPath, bunshinTsOutputPath, join("runtime", "bunshin-ts", "sdk.js")),
    threadSdkOutput: sibling(options.threadSdkOutputPath, threadSdkOutputPath, THREAD_SDK_RELATIVE_PATH),
    rollbackRuntimeOutput: sibling(options.rollbackRuntimeOutputPath, rollbackRuntimeOutputPath, join("runtime", "rollback-migrate.js")),
    memoryDoctorOutput: sibling(options.memoryDoctorOutputPath, memoryDoctorOutputPath, "omc-memory-doctor.js"),
    memoryMemfsOutput: sibling(options.memoryMemfsOutputPath, memoryMemfsOutputPath, "omc-memory-memfs.js"),
    memoryPalaceOutput: sibling(options.memoryPalaceOutputPath, memoryPalaceOutputPath, "omc-memory-palace.js"),
    deviceAccountOutput: sibling(options.deviceAccountOutputPath, deviceAccountOutputPath, "omc-device-account.js"),
    memoryCommandsOutput: sibling(options.memoryCommandsOutputPath, memoryCommandsOutputPath, "omc-memory-commands.js"),
    sessionHistoryOutput: sibling(options.sessionHistoryOutputPath, sessionHistoryOutputPath, "omc-session-history.js"),
    recallStoreOutput: sibling(options.recallStoreOutputPath, recallStoreOutputPath, "omc-recall-store.js"),
    deviceServiceOutput: sibling(options.deviceServiceOutputPath, deviceServiceOutputPath, "omc-device-service.js"),
    telemetryPosthogOutput: sibling(options.telemetryPosthogOutputPath, telemetryPosthogOutputPath, "omc-telemetry-posthog.js"),
    telemetryOtlpOutput: sibling(options.telemetryOtlpOutputPath, telemetryOtlpOutputPath, "omc-telemetry-otlp.js"),
    memorySyncOutput: sibling(options.memorySyncOutputPath, memorySyncOutputPath, "omc-memory-sync.js"),
    threadClientOutput: sibling(options.threadClientOutputPath, threadClientOutputPath, "omc-thread-client.js"),
    telemetryRecoveryOutput: sibling(options.telemetryRecoveryOutputPath, telemetryRecoveryOutputPath, "omc-telemetry-recovery.js"),
    feedbackOutput: sibling(options.feedbackOutputPath, feedbackOutputPath, "omc-feedback.js"),
    desktopToolkitOutput: sibling(options.desktopToolkitOutputPath, desktopToolkitOutputPath, "omc-desktop-toolkit.js"),
    claimReceiptOutput: sibling(options.claimReceiptOutputPath, claimReceiptOutputPath, "omc-claim-receipt.js"),
    computerUseOutput: sibling(options.computerUseOutputPath, computerUseOutputPath, "omc-computer-use.js"),
    gatewayStoreWorkerOutput: sibling(options.gatewayStoreWorkerOutputPath, gatewayStoreWorkerOutputPath, GATEWAY_STORE_WORKER_NAME),
  }
}

export async function buildExtension(options = {}) {
  const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"))
  if (typeof packageManifest.version !== "string" || packageManifest.version.length === 0) {
    throw new Error("omc-senpi package manifest must contain a version")
  }
  const buildDefines = {
    OMC_SENPI_PACKAGE_VERSION: packageManifest.version,
    OMC_SENPI_BUNDLED: true,
  }
  const {
    output,
    taskOutput,
    memberOutput,
    supervisorOutput,
    advisorRuntimeOutput,
    sidePanelRuntimeOutput,
    onboardingScanRuntimeOutput,
    toolkitSdkOutput,
    bunshinTsOutput,
    threadSdkOutput,
    rollbackRuntimeOutput,
    computerUseOutput,
    memoryDoctorOutput,
    memoryMemfsOutput,
    memoryPalaceOutput,
    deviceAccountOutput,
    memoryCommandsOutput,
    sessionHistoryOutput,
    recallStoreOutput,
    deviceServiceOutput,
    telemetryPosthogOutput,
    telemetryOtlpOutput,
    memorySyncOutput,
    threadClientOutput,
    telemetryRecoveryOutput,
    feedbackOutput,
    desktopToolkitOutput,
    claimReceiptOutput,
    gatewayStoreWorkerOutput,
  } = resolveOutputs(options)
  const toolkitSdkInputs = await buildEntry(toolkitSdkEntryPath, toolkitSdkOutput, buildDefines, sdkExternalSpecifiers)
  const bunshinTsInputs = await buildEntry(bunshinTsEntryPath, bunshinTsOutput, buildDefines, sdkExternalSpecifiers)
  const mainInputs = await buildEntry(entryPath, output, buildDefines)
  const taskInputs = await buildEntry(taskEntryPath, taskOutput, buildDefines)
  const memberInputs = await buildEntry(memberEntryPath, memberOutput, buildDefines)
  const supervisorInputs = await buildEntry(supervisorEntryPath, supervisorOutput, buildDefines)
  const advisorRuntimeInputs = await buildEntry(advisorRuntimeEntryPath, advisorRuntimeOutput, buildDefines)
  const sidePanelRuntimeInputs = await buildEntry(sidePanelRuntimeEntryPath, sidePanelRuntimeOutput, buildDefines)
  const onboardingScanRuntimeInputs = await buildEntry(onboardingScanRuntimeEntryPath, onboardingScanRuntimeOutput, buildDefines)
  const rollbackRuntimeInputs = await buildEntry(rollbackRuntimeEntryPath, rollbackRuntimeOutput, buildDefines, sdkExternalSpecifiers)
  const memoryDoctorInputs = await buildEntry(memoryDoctorEntryPath, memoryDoctorOutput, buildDefines)
  const memoryMemfsInputs = await buildEntry(memoryMemfsEntryPath, memoryMemfsOutput, buildDefines)
  const memoryPalaceInputs = await buildEntry(memoryPalaceEntryPath, memoryPalaceOutput, buildDefines)
  const deviceAccountInputs = await buildEntry(deviceAccountEntryPath, deviceAccountOutput, buildDefines)
  const memoryCommandsInputs = await buildEntry(memoryCommandsEntryPath, memoryCommandsOutput, buildDefines)
  const sessionHistoryInputs = await buildEntry(sessionHistoryEntryPath, sessionHistoryOutput, buildDefines)
  const recallStoreInputs = await buildEntry(recallStoreEntryPath, recallStoreOutput, buildDefines)
  const deviceServiceInputs = await buildEntry(deviceServiceEntryPath, deviceServiceOutput, buildDefines)
  const telemetryPosthogInputs = await buildEntry(telemetryPosthogEntryPath, telemetryPosthogOutput, buildDefines)
  const telemetryOtlpInputs = await buildEntry(telemetryOtlpEntryPath, telemetryOtlpOutput, buildDefines)
  const memorySyncInputs = await buildEntry(memorySyncEntryPath, memorySyncOutput, buildDefines, externalSpecifiers, { assets: true })
  const threadClientInputs = await buildEntry(threadClientEntryPath, threadClientOutput, buildDefines)
  const telemetryRecoveryInputs = await buildEntry(telemetryRecoveryEntryPath, telemetryRecoveryOutput, buildDefines)
  const feedbackInputs = await buildEntry(feedbackEntryPath, feedbackOutput, buildDefines)
  const desktopToolkitInputs = await buildEntry(desktopToolkitEntryPath, desktopToolkitOutput, buildDefines)
  const claimReceiptInputs = await buildEntry(claimReceiptEntryPath, claimReceiptOutput, buildDefines)
  const computerUseInputs = await buildEntry(computerUseEntryPath, computerUseOutput, buildDefines)
  const computerRunWorkerInputs = await buildEntry(computerRunWorkerEntryPath, join(dirname(computerUseOutput), COMPUTER_RUN_WORKER_NAME), buildDefines, sdkExternalSpecifiers)
  await copyFile(computerRunWasmSourcePath(), join(dirname(computerUseOutput), COMPUTER_RUN_WASM_NAME))
  const gatewayStoreWorkerInputs = await buildEntry(gatewayStoreWorkerEntryPath, gatewayStoreWorkerOutput, buildDefines, sdkExternalSpecifiers)
  const threadSdkInputs = await buildEntry(threadSdkEntryPath, threadSdkOutput, buildDefines, sdkExternalSpecifiers)
  // Bundling inlines assets.ts but its markdown is read from disk at runtime next to the bundle,
  // so the persona and the computer-use prelude are staged into the directory the loader runs from.
  await Promise.all([
    stageRuntimePersonas(repoRoot, dirname(output)),
    writeFile(join(dirname(output), COMPUTER_PRELUDE_ASSET_NAME), await readFile(computerPreludeAssetSource, "utf8")),
  ])
  return {
    mainInputs,
    taskInputs,
    memberInputs,
    supervisorInputs,
    advisorRuntimeInputs,
    sidePanelRuntimeInputs,
    onboardingScanRuntimeInputs,
    toolkitSdkInputs,
    bunshinTsInputs,
    rollbackRuntimeInputs,
    computerUseInputs,
    computerRunWorkerInputs,
    memoryDoctorInputs,
    memoryMemfsInputs,
    memoryPalaceInputs,
    deviceAccountInputs,
    memoryCommandsInputs,
    sessionHistoryInputs,
    recallStoreInputs,
    deviceServiceInputs,
    telemetryPosthogInputs,
    telemetryOtlpInputs,
    memorySyncInputs,
    threadClientInputs,
    telemetryRecoveryInputs,
    feedbackInputs,
    desktopToolkitInputs,
    claimReceiptInputs,
    gatewayStoreWorkerInputs,
    threadSdkInputs,
  }
}

// `assets`: the entry imports files (the Loro wasm) through Bun's file loader, which is a second output
// that --outfile cannot write; --outdir with fixed names puts the entry at `output` and each asset beside it.
async function buildEntry(entry, output, buildDefines, externals = externalSpecifiers, { assets = false } = {}) {
  await mkdir(dirname(output), { recursive: true })
  const metafile = `${output}.meta.json`
  const target = assets
    ? ["--outdir", dirname(output), "--entry-naming", basename(output), "--asset-naming", "[name].[ext]"]
    : ["--outfile", output]
  try {
    runBuildCommand(resolveBunExecutable(), [
      "build", entry, "--target", "node", "--format", "esm", ...target,
      "--minify-syntax", "--minify-whitespace", `--metafile=${metafile}`,
      ...Object.entries(buildDefines).flatMap(([name, value]) => ["--define", `${name}=${JSON.stringify(value)}`]),
      ...externals.flatMap((specifier) => ["--external", specifier]),
    ])
    await normalizeBuiltinImports(output, builtinModuleNames)
    await minifyBundle(output)
    return await attachBuildMarker({
      output,
      entry,
      metafile,
      buildDefines,
      repoRoot,
      buildSettings: JSON.stringify({ settings: BUILD_SETTINGS, externals }),
      buildScriptPath,
    })
  } finally {
    await rm(metafile, { force: true })
  }
}

export function runBuildCommand(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
