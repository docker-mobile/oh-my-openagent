import { isPlainRecord } from "./codex-cache-fs"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGED_CODEX_INSTALLER_NAMES = new Set([
  "@code-yeongyu/lazycodex",
  "@code-yeongyu/lazycodex-ai",
  "lazycodex",
  "lazycodex-ai",
  "oh-my-cybersecurity",
  "oh-my-cybersecurity",
])

export async function shouldBuildSourcePackages(repoRoot: string): Promise<boolean> {
  if (existsSync(join(repoRoot, "packages", "omc-opencode", "src", "index.ts"))) return true
  const packageJsonPath = join(repoRoot, "package.json")
  if (!existsSync(packageJsonPath)) return true
  const packageJson: unknown = JSON.parse(await readFile(packageJsonPath, "utf8"))
  if (!isPlainRecord(packageJson) || typeof packageJson.name !== "string") return true
  return !PACKAGED_CODEX_INSTALLER_NAMES.has(packageJson.name)
}
