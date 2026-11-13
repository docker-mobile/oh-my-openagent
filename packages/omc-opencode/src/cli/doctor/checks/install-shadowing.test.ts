/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  checkInstallShadowing,
  scanFamilyInstalls,
  summarizeShadowing,
  type InstallEntry,
} from "./install-shadowing"

function makeBinary(directory: string, name: string): string {
  const filepath = join(directory, name)
  writeFileSync(filepath, "#!/bin/sh\necho stub\n", "utf-8")
  chmodSync(filepath, 0o755)
  return filepath
}

describe("checkInstallShadowing (#4451)", () => {
  test("#given a single OmC binary on PATH #when running the check #then status is pass", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omc-shadow-"))
    try {
      const path = makeBinary(dir, "oh-my-cybersecurity")
      const result = await checkInstallShadowing({
        pathEntries: [dir],
        platform: "linux",
        resolveVersion: async (bin) => (bin === path ? "4.4.0" : null),
      })
      expect(result.status).toBe("pass")
      expect(result.message).toContain("4.4.0")
      expect(result.issues).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("#given two binaries with different versions on PATH #when running the check #then status is warn with a fix hint", async () => {
    const dirA = mkdtempSync(join(tmpdir(), "omc-shadow-a-"))
    const dirB = mkdtempSync(join(tmpdir(), "omc-shadow-b-"))
    try {
      const oldPath = makeBinary(dirA, "oh-my-cybersecurity")
      const newPath = makeBinary(dirB, "oh-my-cybersecurity")

      const result = await checkInstallShadowing({
        pathEntries: [dirA, dirB],
        platform: "linux",
        resolveVersion: async (bin) => {
          if (bin === oldPath) return "3.17.5"
          if (bin === newPath) return "4.4.0"
          return null
        },
      })

      expect(result.status).toBe("warn")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]?.severity).toBe("warning")
      expect(result.issues[0]?.fix).toContain("npm uninstall")
      expect(result.issues[0]?.fix).toContain("bun unlink")
      expect(result.issues[0]?.fix).toContain("bunx oh-my-cybersecurity")
      expect(result.issues[0]?.fix).not.toContain("npm install -g")
      expect(result.issues[0]?.fix).not.toContain("bun add -g")
      expect(result.issues[0]?.affects).toContain(oldPath)
      expect(result.issues[0]?.affects).toContain(newPath)

      const detailsText = (result.details ?? []).join(" ")
      expect(detailsText).toContain("3.17.5")
      expect(detailsText).toContain("4.4.0")
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })

  test("#given two binaries with the same version on PATH #when running the check #then status is pass", async () => {
    const dirA = mkdtempSync(join(tmpdir(), "omc-shadow-same-a-"))
    const dirB = mkdtempSync(join(tmpdir(), "omc-shadow-same-b-"))
    try {
      makeBinary(dirA, "oh-my-cybersecurity")
      makeBinary(dirB, "oh-my-cybersecurity")
      const result = await checkInstallShadowing({
        pathEntries: [dirA, dirB],
        platform: "linux",
        resolveVersion: async () => "4.4.0",
      })
      expect(result.status).toBe("pass")
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })

  test("#given no OmC binaries on PATH #when running the check #then status is skip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omc-shadow-empty-"))
    try {
      const result = await checkInstallShadowing({
        pathEntries: [dir],
        platform: "linux",
        resolveVersion: async () => null,
      })
      expect(result.status).toBe("skip")
      expect(result.issues).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("scanFamilyInstalls + summarizeShadowing helpers (#4451)", () => {
  test("#given PATH duplicates for the same binary #when scanning #then each unique path is reported once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omc-shadow-dedup-"))
    try {
      makeBinary(dir, "oh-my-cybersecurity")
      const entries = await scanFamilyInstalls({
        pathEntries: [dir, dir, dir],
        platform: "linux",
        resolveVersion: async () => "4.4.0",
      })
      expect(entries).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("#given an entry with no resolvable version #when summarizing #then it is bucketed under its own unresolved key", () => {
    const entries: InstallEntry[] = [
      { binary: "oh-my-cybersecurity", path: "/usr/local/bin/oh-my-cybersecurity", version: "4.4.0" },
      { binary: "oh-my-cybersecurity", path: "/opt/legacy/bin/oh-my-cybersecurity", version: null },
    ]
    const summary = summarizeShadowing(entries)
    expect(summary.status).toBe("warn")
    expect(summary.distinctVersions).toHaveLength(2)
    expect(summary.distinctVersions.some((v) => v.startsWith("unresolved:"))).toBe(true)
  })

  test("#given omc-agent-toolkit and an unrelated omc binary on PATH #when scanning #then only the family binary is found", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omc-shadow-family-"))
    try {
      const toolkitPath = makeBinary(dir, "omc-agent-toolkit")
      makeBinary(dir, "omc")
      const entries = await scanFamilyInstalls({
        pathEntries: [dir],
        platform: "linux",
        resolveVersion: async () => "5.0.0",
      })
      expect(entries).toEqual([{ binary: "omc-agent-toolkit", path: toolkitPath, version: "5.0.0" }])
      expect(entries.some((entry) => entry.binary === "omc")).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
