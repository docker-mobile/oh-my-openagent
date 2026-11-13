import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildExtension } from "./build-extension.mjs"

export function outputPathsIn(root) {
  return {
    outputPath: join(root, "omc.js"),
    taskOutputPath: join(root, "omc-task.js"),
    memberOutputPath: join(root, "omc-member.js"),
    supervisorOutputPath: join(root, "memory-run-supervisor.mjs"),
    advisorRuntimeOutputPath: join(root, "omc-init-deep-advisor.js"),
    sidePanelRuntimeOutputPath: join(root, "omc-side-panel.js"),
    onboardingScanRuntimeOutputPath: join(root, "omc-onboarding-scan.js"),
    toolkitSdkOutputPath: join(root, "runtime", "agent-toolkit-sdk", "sdk.js"),
    bunshinTsOutputPath: join(root, "runtime", "bunshin-ts", "sdk.js"),
    rollbackRuntimeOutputPath: join(root, "runtime", "rollback-migrate.js"),
    memoryDoctorOutputPath: join(root, "omc-memory-doctor.js"),
    memoryMemfsOutputPath: join(root, "omc-memory-memfs.js"),
    memoryPalaceOutputPath: join(root, "omc-memory-palace.js"),
    deviceAccountOutputPath: join(root, "omc-device-account.js"),
    memoryCommandsOutputPath: join(root, "omc-memory-commands.js"),
    sessionHistoryOutputPath: join(root, "omc-session-history.js"),
    recallStoreOutputPath: join(root, "omc-recall-store.js"),
    deviceServiceOutputPath: join(root, "omc-device-service.js"),
    telemetryPosthogOutputPath: join(root, "omc-telemetry-posthog.js"),
    telemetryOtlpOutputPath: join(root, "omc-telemetry-otlp.js"),
    memorySyncOutputPath: join(root, "omc-memory-sync.js"),
    threadClientOutputPath: join(root, "omc-thread-client.js"),
    telemetryRecoveryOutputPath: join(root, "omc-telemetry-recovery.js"),
    feedbackOutputPath: join(root, "omc-feedback.js"),
    desktopToolkitOutputPath: join(root, "omc-desktop-toolkit.js"),
    claimReceiptOutputPath: join(root, "omc-claim-receipt.js"),
    computerUseOutputPath: join(root, "omc-computer-use.js"),
    gatewayStoreWorkerOutputPath: join(root, "gateway-store-worker.mjs"),
    gatewayRulesExtensionOutputPath: join(root, "gateway-rules-extension.mjs"),
    threadSdkOutputPath: join(root, "runtime", "thread-sdk", "sdk.js"),
  }
}

/**
 * The esbuild pass dominates a build test file, so each file builds once and every read-only
 * assertion shares it. Cases that mutate an artifact copy the built tree instead of rebuilding,
 * which keeps them isolated for a fraction of the cost. `cleanupTest` / `cleanupFile` belong in
 * the file's `afterEach` / `afterAll`.
 *
 * `reproductionRoot` is a second, independent build of the same sources, made once per file, that
 * freshness checks compare against (`checkExtensionCurrent({ ...outputs, expectedRoot })`) instead
 * of each check rebuilding its own reproduction. It stays a separate build so the comparison still
 * proves the build reproduces its outputs.
 */
export function createBuildFixture() {
  const perTestRoots = []
  let sharedBuildPromise = null
  let reproductionPromise = null
  async function sharedOutputs() {
    sharedBuildPromise ??= (async () => {
      const root = await mkdtemp(join(tmpdir(), "omc-senpi-extension-test-shared-"))
      const paths = outputPathsIn(root)
      const build = await buildExtension(paths)
      return { root, ...paths, ...build }
    })()
    return sharedBuildPromise
  }
  async function mutableOutputs() {
    const shared = await sharedOutputs()
    const root = await mkdtemp(join(tmpdir(), "omc-senpi-extension-test-"))
    perTestRoots.push(root)
    await cp(shared.root, root, { recursive: true })
    return { root, ...outputPathsIn(root), mainInputs: shared.mainInputs, taskInputs: shared.taskInputs }
  }
  async function reproductionRoot() {
    reproductionPromise ??= (async () => {
      const root = await mkdtemp(join(tmpdir(), "omc-senpi-extension-test-reproduction-"))
      await buildExtension(outputPathsIn(root))
      return root
    })()
    return reproductionPromise
  }
  return {
    perTestRoots,
    sharedOutputs,
    mutableOutputs,
    reproductionRoot,
    cleanupTest: async () => {
      await Promise.all(perTestRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
    },
    cleanupFile: async () => {
      const roots = await Promise.all([
        sharedBuildPromise === null ? undefined : sharedBuildPromise.then((shared) => shared.root),
        reproductionPromise,
      ])
      await Promise.all(roots.filter((root) => root != null).map((root) => rm(root, { recursive: true, force: true })))
    },
  }
}
