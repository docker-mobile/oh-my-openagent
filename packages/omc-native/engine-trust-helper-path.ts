import { join } from "node:path"
import { getDesktopEngineHost } from "@oh-my-cybersecurity/senpi-desktop-engine"

/** Hosts whose compiled payload ships the engine trust helper (omc#10762); Linux reads its trust store from files. */
const ENGINE_TRUST_HELPER_HOSTS: readonly string[] = ["darwin-arm64", "darwin-x64", "win32-x64", "win32-arm64"]

/**
 * Absolute path of the trust helper the compiled binary extracted, verified against its runtime manifest, into
 * `OMC_PACKAGE_DIR` (`native/prebuilds/<host>/omc-engine-trust-helper[.exe]`, staged by script/build-omc-binary.ts).
 * Null on hosts that ship no helper, or when no extracted runtime directory is known.
 */
export function resolveEngineTrustHelperPath(
  env: Readonly<Record<string, string | undefined>>,
  platform: string = process.platform,
  arch: string = process.arch,
): string | null {
  const runtimeDir = env.OMC_PACKAGE_DIR
  if (!runtimeDir) return null
  const host = getDesktopEngineHost(platform, arch)
  if (!ENGINE_TRUST_HELPER_HOSTS.includes(host)) return null
  const file = platform === "win32" ? "omc-engine-trust-helper.exe" : "omc-engine-trust-helper"
  return join(runtimeDir, "native", "prebuilds", host, file)
}
