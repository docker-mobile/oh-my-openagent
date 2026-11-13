import { afterEach, expect, test } from "bun:test"
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runMigration, updateOmoConfig } from "../index"
import { DEFAULT_MIGRATION_FILE_SYSTEM } from "./types"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "config-mode-fold-"))
  roots.push(home)
  return home
}
const mode = (path: string) => statSync(path).mode & 0o777

test("symlinked legacy config moves without touching a read-only target or leaving a journal", () => {
  if (process.platform === "win32") return
  const home = fixture()
  mkdirSync(join(home, ".omc"))
  const target = join(home, "immutable-config")
  writeFileSync(target, '{"task":{"default_concurrency":3}}', { mode: 0o444 })
  chmodSync(target, 0o444)
  const source = join(home, ".omc", "config.jsonc")
  const backup = join(home, ".omc", "backups", "config.jsonc")
  symlinkSync(target, source)
  const result = runMigration({
    env: { HOME: home }, id: "symlink", sources: [{ path: source, backupPath: backup }],
    targetPath: join(home, ".omc", "omc.jsonc"), transform: () => ({}),
  })
  expect(result.status).toBe("migrated")
  expect(mode(target)).toBe(0o444)
  expect(readFileSync(target, "utf8")).toContain("default_concurrency")
  expect(lstatSync(backup).isSymbolicLink()).toBe(true)
  expect(existsSync(join(home, ".omc", ".migration-journal.json"))).toBe(false)
})

test("existing live config keeps its mode even under a restrictive umask; backups remain private", () => {
  if (process.platform === "win32") return
  const home = fixture()
  mkdirSync(join(home, ".omc"))
  const targetPath = join(home, ".omc", "omc.jsonc")
  writeFileSync(targetPath, "{}")
  chmodSync(targetPath, 0o644)
  const old = process.umask(0o077)
  try {
    const result = updateOmoConfig({ scope: "user", env: { HOME: home }, edits: [{ path: ["categories"], value: {} }] })
    expect(mode(targetPath)).toBe(0o644)
    expect(result.backupPath).toBeDefined()
    if (result.backupPath === undefined) throw new Error("Missing backup")
    expect(mode(result.backupPath)).toBe(0o600)
  } finally { process.umask(old) }
})

test("migration preserves a live target mode and creates normal user and project directories", () => {
  if (process.platform === "win32") return
  const home = fixture()
  const old = process.umask(0o022)
  try {
    const source = join(home, "legacy.jsonc")
    writeFileSync(source, "{}")
    const targetPath = join(home, ".omc", "omc.jsonc")
    runMigration({ env: { HOME: home }, id: "normal-home", sources: [{ path: source }], targetPath, transform: () => ({}) })
    expect(mode(join(home, ".omc"))).toBe(0o755)
    expect(mode(targetPath)).toBe(0o600)
    chmodSync(targetPath, 0o644)
    writeFileSync(source, "{}")
    runMigration({ env: { HOME: home }, id: "existing-target", sources: [{ path: source }], targetPath, transform: () => ({}) })
    expect(mode(targetPath)).toBe(0o644)
    const project = join(home, "project")
    mkdirSync(project)
    updateOmoConfig({ scope: "project", projectDir: project, env: { HOME: home }, edits: [] })
    expect(mode(join(project, ".omc"))).toBe(0o755)
    expect(mode(join(project, ".omc", "omc.jsonc"))).toBe(0o600)
  } finally { process.umask(old) }
})

test("recovery completes when a crash leaves both the private backup and its identical source", () => {
  const home = fixture()
  const source = join(home, "legacy.jsonc")
  writeFileSync(source, "{}")
  const options = { env: { HOME: home }, id: "backup-unlink-crash", sources: [{ path: source }], targetPath: join(home, ".omc", "omc.jsonc"), transform: () => ({}) }
  expect(() => runMigration({
    ...options,
    fileSystem: { ...DEFAULT_MIGRATION_FILE_SYSTEM, unlinkSync: (path) => {
      if (path === source) throw new Error("synthetic crash before source removal")
      DEFAULT_MIGRATION_FILE_SYSTEM.unlinkSync(path)
    } },
  })).toThrow("synthetic crash")
  expect(existsSync(join(home, ".omc", ".migration-journal.json"))).toBe(true)
  const recovered = runMigration(options)
  expect(recovered.journalResumed).toBe(true)
  expect(existsSync(source)).toBe(false)
  expect(existsSync(join(home, ".omc", ".migration-journal.json"))).toBe(false)
})
