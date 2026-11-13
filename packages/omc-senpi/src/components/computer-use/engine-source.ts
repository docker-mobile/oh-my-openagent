import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  desktopEngineReleaseAssetName,
  getDesktopEngineHost,
  locateDesktopEngine,
  type DesktopEngineLocatorOptions,
} from "@oh-my-cybersecurity/senpi-desktop-engine"
import {
  acquiringEngineChildFactory,
  type ChildFactory,
  DesktopEngineUnavailableError,
  engineChildFactory,
} from "@oh-my-cybersecurity/senpi-desktop-service"
import { explicitPathDiagnostic, resolveInstalledEngine } from "./installed-engine"

type Env = Readonly<Record<string, string | undefined>>

function manifestVersion(packageDir: string, names: readonly string[]): string | undefined {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"))
  } catch {
    return undefined
  }
  if (typeof manifest !== "object" || manifest === null) return undefined
  const name = Reflect.get(manifest, "name")
  const version = Reflect.get(manifest, "version")
  return typeof name === "string" && names.includes(name) && typeof version === "string" && version.length > 0
    ? version
    : undefined
}

/**
 * The omc release this session runs, which names the GitHub release that carries the engine binary:
 * the compiled runtime's stamped manifest (`OMC_PACKAGE_DIR`), else the `omc-ai` package the npm
 * launcher runs from (`OMC_BIN` is its `bin/omc.js`). Undefined outside an omc launch.
 */
export function omoReleaseVersion(env: Env): string | undefined {
  const packageDir = env.OMC_PACKAGE_DIR?.trim()
  if (packageDir) {
    const stamped = manifestVersion(packageDir, ["omc"])
    if (stamped !== undefined) return stamped
  }
  const bin = env.OMC_BIN?.trim()
  return bin ? manifestVersion(dirname(dirname(bin)), ["omc-ai"]) : undefined
}

/**
 * `computer.engine_path` wins; an omc launch acquires the engine for its own release (local install
 * first, then the verified GitHub release download); anything else uses the synchronous locator.
 */
export function defaultEngineChild(
  env: Env = process.env,
  locatorOptions?: DesktopEngineLocatorOptions,
  childEnv?: NodeJS.ProcessEnv,
): (enginePath: string | undefined) => ChildFactory {
  return (enginePath) => {
    if (enginePath !== undefined) return explicitEngineChild(enginePath, childEnv)
    const version = omoReleaseVersion(env)
    if (version !== undefined) return acquiringEngineChildFactory({ version, env: childEnv })
    if (locatorOptions === undefined) return engineChildFactory(undefined, childEnv)
    return () => {
      const located = locateDesktopEngine(locatorOptions)
      if (located.path === null) throw new DesktopEngineUnavailableError(located.diagnostic)
      return engineChildFactory(located.path, childEnv)()
    }
  }
}

/** Describes installation state only; neither acquisition nor an engine process is started. */
export function describeEngineSource(
  enginePath: string | undefined,
  env: Env,
  locatorOptions: DesktopEngineLocatorOptions = {},
): string {
  const version = omoReleaseVersion(env)
  const resolved = resolveInstalledEngine(enginePath, env, version, locatorOptions)
  if ("path" in resolved) {
    const release = resolved.source === "cache" ? `, omc v${version}` : ""
    return `found ${resolved.path} (${resolved.source}${release})`
  }
  if ("diagnostic" in resolved) {
    return resolved.diagnostic.reason === "no-release-asset"
      ? resolved.diagnostic.message
      : `${resolved.diagnostic.message} ${resolved.diagnostic.cause}`
  }
  const asset = desktopEngineReleaseAssetName(resolved.notInstalled.host)
  return version !== undefined && asset !== null
    ? `would download ${asset} from omc v${version} on first use`
    : `native-unavailable for ${resolved.notInstalled.host}: ${resolved.notInstalled.cause}`
}

function explicitEngineChild(enginePath: string, env?: NodeJS.ProcessEnv): ChildFactory {
  const host = getDesktopEngineHost()
  const diagnostic = explicitPathDiagnostic(enginePath, host, process.platform)
  if (diagnostic !== undefined) {
    return () => {
      throw new DesktopEngineUnavailableError(diagnostic)
    }
  }
  return engineChildFactory(enginePath, env)
}
