import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import manifest from "../package.json"

const packageRoot = resolve(import.meta.dir, "..")
const senpiBadgeGateManifests = [
  join("packages", "omc-senpi", "package.json"),
  join("packages", "senpi-task", "package.json"),
]

function collectDirectoryNames(root: string): string[] {
  if (!existsSync(root)) return []
  const found: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (!statSync(full).isDirectory()) continue
      found.push(entry)
      walk(full)
    }
  }
  walk(root)
  return found
}

describe("omc native footer badge absence for omc-ai installs", () => {
  describe("#given the published omc-ai payload", () => {
    describe("#when the shipped file set is inspected", () => {
      test("#then no shipped directory carries a senpi badge gate manifest", () => {
        for (const shipped of manifest.files) {
          const shippedRoot = join(packageRoot, shipped)
          for (const gateManifest of senpiBadgeGateManifests) {
            expect(existsSync(join(shippedRoot, gateManifest))).toBe(false)
          }
          expect(collectDirectoryNames(shippedRoot)).not.toContain("packages")
        }
      })
    })
  })
})
