import { firstOmoBinOnPath, nativeOmoBin, scanOmoBins } from "./legacy-omc-bin"
import type { OmoBinEntry, OmoBinEnvironment } from "./legacy-omc-bin"
import { describePackage } from "./repair-legacy-omc-bin"

export interface OmoVersionProbeResult {
  readonly exitCode: number
  readonly stdout: string
}

export type OmoVersionProbe = (command: string, args: readonly string[]) => Promise<OmoVersionProbeResult>

export type OmoCommandVerification =
  | {
      readonly ok: true
      /** The omc-ai `omc` that was verified. */
      readonly binPath: string
      readonly notes: readonly string[]
      readonly warnings: readonly string[]
    }
  | { readonly ok: false; readonly notes: readonly string[]; readonly warnings: readonly string[] }

export function pathOrderFix(directory: string, isWindows: boolean): string {
  return isWindows ? `set PATH=${directory};%PATH%` : `export PATH="${directory}:$PATH"`
}

export async function verifyOmoCommand(options: {
  readonly environment: OmoBinEnvironment
  readonly probeVersion: OmoVersionProbe
}): Promise<OmoCommandVerification> {
  const entries = scanOmoBins(options.environment)
  const native = nativeOmoBin(entries)
  const resolved = firstOmoBinOnPath(entries)

  if (native === null) {
    return {
      ok: false,
      notes: [],
      warnings: ["Could not find an omc command owned by omc-ai after the install. Run omc --version yourself to check."],
    }
  }

  if (!native.onPath) {
    return {
      ok: false,
      notes: [],
      warnings: [
        `omc-ai installed ${native.binPath}, but ${native.directory} is not on PATH. Add it: ${pathOrderFix(native.directory, options.environment.isWindows)}`,
      ],
    }
  }

  if (resolved !== null && resolved.binPath !== native.binPath) {
    return { ok: false, notes: [], warnings: [shadowWarning(resolved, native, options.environment.isWindows)] }
  }

  const probe = await options.probeVersion(native.binPath, ["--version"])
  const printed = probe.stdout.trim().split("\n")[0] ?? ""
  if (probe.exitCode !== 0 || !printed.startsWith("omc ")) {
    return {
      ok: false,
      notes: [],
      warnings: [`omc --version did not report omc-ai (exit ${probe.exitCode}): ${printed || "no output"}`],
    }
  }

  return { ok: true, binPath: native.binPath, notes: [`omc --version reports ${printed}`], warnings: [] }
}

function shadowWarning(resolved: OmoBinEntry, native: OmoBinEntry, isWindows: boolean): string {
  return `omc on PATH still resolves to ${resolved.binPath} (${describePackage(resolved)}), not to the omc-ai command at ${native.binPath}. Put omc-ai first: ${pathOrderFix(native.directory, isWindows)}`
}
