import { formatNativeInstallEntryCommand, resolveNativeInstallPlan } from "./install-native/plan"
import type { InstallConfig } from "./types"

// The installer command, not the raw `bun add -g`: it is the only spelling that is also correct on a
// machine whose global `omc` still belongs to a pre-rename oh-my-cybersecurity release.
export const NATIVE_EDITION_INSTALL_COMMAND = formatNativeInstallEntryCommand(resolveNativeInstallPlan(true))
export const NATIVE_EDITION_GUIDE_URL =
  "https://github.com/code-yeongyu/oh-my-cybersecurity/blob/dev/docs/guide/migrating-from-opencode.md"
export const NATIVE_EDITION_HINT_TITLE = "OmC Native (beta)"

export type NativeEditionHintPaint = {
  readonly command: (text: string) => string
  readonly link: (text: string) => string
}

const PLAIN_PAINT: NativeEditionHintPaint = {
  command: (text) => text,
  link: (text) => text,
}

export function shouldShowNativeEditionHint(
  config: Pick<InstallConfig, "hasNative" | "hasNativeDev">,
): boolean {
  return !config.hasNative && !config.hasNativeDev
}

export function nativeEditionHintLines(paint: NativeEditionHintPaint = PLAIN_PAINT): readonly string[] {
  return [
    `omc also ships as OmC Native: the same omc as one ${paint.command("omc")} command, with no OpenCode host required.`,
    `Try it next to this install: ${paint.command(NATIVE_EDITION_INSTALL_COMMAND)}, then run ${paint.command("omc")}.`,
    "This install keeps working as-is.",
    `Guide: ${paint.link(NATIVE_EDITION_GUIDE_URL)}`,
  ]
}
