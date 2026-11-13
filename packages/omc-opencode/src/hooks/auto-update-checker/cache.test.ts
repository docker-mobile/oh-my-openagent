import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { invalidatePackage } from "./cache"

const temporaryDirectories: string[] = []

function createTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("auto-update cache invalidation", () => {
  it("#given invalid text lockfile only #when invalidating package #then returns false without deleting cache root", () => {
    // given
    const cacheDir = createTemporaryDirectory("omc-auto-update-cache-")
    const userConfigDir = createTemporaryDirectory("omc-auto-update-config-")
    writeFileSync(join(cacheDir, "bun.lock"), "{not json", "utf-8")

    // when
    const result = invalidatePackage("oh-my-cybersecurity", {
      acceptedPackageNames: ["oh-my-cybersecurity"],
      cacheDir,
      defaultPackageName: "oh-my-cybersecurity",
      userConfigDir,
    })

    // then
    expect(result).toBe(false)
    expect(existsSync(cacheDir)).toBe(true)
  })

  it("#given binary lockfile only #when invalidating package #then deletes lockfile", () => {
    // given
    const cacheDir = createTemporaryDirectory("omc-auto-update-cache-")
    const userConfigDir = createTemporaryDirectory("omc-auto-update-config-")
    const lockPath = join(cacheDir, "bun.lockb")
    writeFileSync(lockPath, "binary", "utf-8")

    // when
    const result = invalidatePackage("oh-my-cybersecurity", {
      acceptedPackageNames: ["oh-my-cybersecurity"],
      cacheDir,
      defaultPackageName: "oh-my-cybersecurity",
      userConfigDir,
    })

    // then
    expect(result).toBe(true)
    expect(existsSync(lockPath)).toBe(false)
  })
})
