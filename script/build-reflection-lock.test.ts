import { test } from "bun:test"
import { buildReflectionLock } from "./build-reflection-lock"

test("the omc doctor reflection lock bundle matches the shared decision", async () => {
  await buildReflectionLock(true)
})
