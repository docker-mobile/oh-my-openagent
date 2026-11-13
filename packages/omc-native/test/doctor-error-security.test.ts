import { afterEach, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { doctorComputerUseLines } from "../bin/lib/computer-use-doctor.js"

const secret = "sk-test-DO-NOT-PRINT-0000"
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("computer use doctor does not echo an exception containing config data", async () => {
  const lines = await doctorComputerUseLines({ loadRuntime: async () => { throw new Error(secret) } })
  expect(lines.length).toBeGreaterThan(0)
  expect(lines.join("\n")).not.toContain(secret)
})
