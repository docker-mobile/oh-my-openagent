import { describe, expect, test } from "bun:test"

import {
  REPEAT_ABORT_THRESHOLD,
  REPEAT_THRESHOLD,
  REFLECTOR_MESSAGE_CAP,
  RepeatDetector,
  buildReflectorMessage,
  fingerprintToolCall,
  fixToolCallArgs,
  type ToolSchemaShape,
} from "./toolcall-guard"

describe("#fingerprintToolCall", () => {
  test("#given identical calls produce identical fingerprints", () => {
    const a: Snapshot = { name: "read_file", args: '{"path":"a.ts"}' }
    const b: Snapshot = { name: "read_file", args: '{"path":"a.ts"}' }
    expect(fingerprintToolCall(a)).toBe(fingerprintToolCall(b))
  })

  test("#when key order differs #then the fingerprint is unchanged", () => {
    const a: Snapshot = { name: "edit", args: '{"path":"a.ts","text":"x"}' }
    const b: Snapshot = { name: "edit", args: '{"text":"x","path":"a.ts"}' }
    expect(fingerprintToolCall(a)).toBe(fingerprintToolCall(b))
  })

  test("#when a state token changes #then the fingerprint changes", () => {
    const before: Snapshot = { name: "read_file", args: '{"path":"a.ts"}', stateToken: "mtime-1" }
    const after: Snapshot = { name: "read_file", args: '{"path":"a.ts"}', stateToken: "mtime-2" }
    expect(fingerprintToolCall(before)).not.toBe(fingerprintToolCall(after))
  })

  test("#when only a chatter key differs #then the fingerprint is unchanged", () => {
    const plain: Snapshot = { name: "edit", args: '{"path":"a.ts"}' }
    const padded: Snapshot = { name: "edit", args: '{"path":"a.ts","message":"trying again"}' }
    expect(fingerprintToolCall(plain)).toBe(fingerprintToolCall(padded))
  })

  test("#when different tool names collide on args #then the fingerprints differ", () => {
    const a: Snapshot = { name: "read_file", args: '{"path":"a.ts"}' }
    const b: Snapshot = { name: "grep", args: '{"path":"a.ts"}' }
    expect(fingerprintToolCall(a)).not.toBe(fingerprintToolCall(b))
  })
})

describe("#RepeatDetector", () => {
  test("#given first observation #then the count is 1 and nothing repeats", () => {
    const detector = new RepeatDetector()
    const report = detector.observe(call(), "ok")
    expect(report.count).toBe(1)
    expect(report.repeating).toBe(false)
    expect(report.notice).toBeNull()
  })

  test("#when the threshold is crossed #then it reports repeating with a notice", () => {
    const detector = new RepeatDetector()
    for (let i = 0; i < REPEAT_THRESHOLD - 1; i += 1) detector.observe(call(), "same answer")
    const report = detector.observe(call(), "same answer")
    expect(report.count).toBe(REPEAT_THRESHOLD)
    expect(report.repeating).toBe(true)
    expect(report.notice).toContain("read_file")
    expect(report.notice).toContain("3 times")
  })

  test("#when a state token changes #then a legitimate re-read is not a repeat", () => {
    const detector = new RepeatDetector()
    for (let i = 0; i < REPEAT_THRESHOLD; i += 1) {
      const report = detector.observe(call({ stateToken: `mtime-${i}` }), "file content")
      expect(report.repeating).toBe(false)
    }
  })

  test("#when a different call arrives #then the streak resets", () => {
    const detector = new RepeatDetector()
    detector.observe(call(), "a")
    detector.observe(call(), "a")
    const report = detector.observe(call({ args: '{"path":"b.ts"}' }), "b")
    expect(report.count).toBe(1)
    expect(report.repeating).toBe(false)
  })

  test("#when repeating with a tool answer #then the notice echoes that answer", () => {
    const detector = new RepeatDetector()
    let report = detector.observe(call(), "tool X does not exist")
    for (let i = 0; i < REPEAT_THRESHOLD - 1; i += 1) report = detector.observe(call(), "tool X does not exist")
    expect(report.repeating).toBe(true)
    expect(report.notice).toContain("tool X does not exist")
    expect(report.previousResponse).toBe("tool X does not exist")
  })

  test("#when the streak exceeds the abort threshold #then shouldAbort fires", () => {
    const detector = new RepeatDetector()
    for (let i = 0; i < REPEAT_ABORT_THRESHOLD - 1; i += 1) detector.observe(call(), "same")
    expect(detector.shouldAbort()).toBe(false)
    detector.observe(call(), "same")
    expect(detector.shouldAbort()).toBe(true)
  })

  test("#when reset after a streak #then counting restarts from one", () => {
    const detector = new RepeatDetector()
    for (let i = 0; i < REPEAT_ABORT_THRESHOLD; i += 1) detector.observe(call(), "same")
    detector.reset()
    const report = detector.observe(call(), "same")
    expect(report.count).toBe(1)
    expect(detector.shouldAbort()).toBe(false)
  })
})

describe("#fixToolCallArgs", () => {
  test("#given already valid JSON #then the verdict is valid with no changes", () => {
    const result = fixToolCallArgs('{"path":"a.ts","line":3}')
    expect(result.verdict).toBe("valid")
    expect(result.changes).toHaveLength(0)
    expect(result.value).toEqual({ path: "a.ts", line: 3 })
  })

  test("#when the payload is a double-encoded JSON string #then it is decoded", () => {
    const result = fixToolCallArgs(JSON.stringify(JSON.stringify({ path: "a.ts" })))
    expect(result.verdict).toBe("fixed")
    expect(result.value).toEqual({ path: "a.ts" })
    expect(result.changes.join(" ")).toContain("double-encoded")
  })

  test("#when keys are single-quoted #then they are repaired without dropping a key", () => {
    const result = fixToolCallArgs("{'path': 'a.ts', 'line': 3}")
    expect(result.verdict).toBe("fixed")
    expect(result.value).toEqual({ path: "a.ts", line: 3 })
    expect(Object.keys(result.value ?? {})).toHaveLength(2)
    expect(result.changes.join(" ")).toContain("single-quoted")
  })

  test("#when there is a trailing comma #then it is stripped", () => {
    const result = fixToolCallArgs('{"path":"a.ts","line":3,}')
    expect(result.verdict).toBe("fixed")
    expect(result.value).toEqual({ path: "a.ts", line: 3 })
    expect(result.changes.join(" ")).toContain("trailing commas")
  })

  test("#when the object is wrapped in prose #then it is extracted", () => {
    const result = fixToolCallArgs('Sure! Here are the arguments: {"path":"a.ts"} hope that helps')
    expect(result.verdict).toBe("fixed")
    expect(result.value).toEqual({ path: "a.ts" })
    expect(result.changes.join(" ")).toContain("prose")
  })

  test("#when nothing can be salvaged #then the verdict is unrepairable", () => {
    const result = fixToolCallArgs("no json here at all")
    expect(result.verdict).toBe("unrepairable")
    expect(result.value).toBeNull()
  })

  test("#when a repaired object re-parses #then no argument key was dropped", () => {
    const result = fixToolCallArgs("{'path': 'a.ts', 'mode': 'rw',}")
    const keys = Object.keys(result.value ?? {})
    expect(keys.sort()).toEqual(["mode", "path"])
  })
})

describe("#buildReflectorMessage", () => {
  const schema: ToolSchemaShape = {
    name: "edit_file",
    fields: [
      { name: "path", type: "string", required: true },
      { name: "text", type: "string", required: true },
    ],
  }

  test("#given a malformed call #then the message names the violation and the shape", () => {
    const message = buildReflectorMessage({
      toolName: "edit_file",
      rawArgs: "{'path': 'a.ts'}",
      error: "unexpected end of JSON input",
      schema,
    })
    expect(message).toContain("edit_file")
    expect(message).toContain("not valid JSON")
    expect(message).toContain("text: string")
    expect(message).toContain("minimal changes")
  })

  test("#when a required argument is missing #then it is named explicitly", () => {
    const message = buildReflectorMessage({
      toolName: "edit_file",
      rawArgs: '{"path":"a.ts"}',
      error: "missing field",
      schema,
    })
    expect(message).toContain("missing required argument(s): text")
  })

  test("#when the message exceeds the cap #then it is hard-truncated to the cap", () => {
    const message = buildReflectorMessage({
      toolName: "edit_file",
      rawArgs: '{"path":"a.ts"}',
      error: "e".repeat(5000),
      schema,
    })
    expect(message.length).toBe(REFLECTOR_MESSAGE_CAP + "...[truncated]".length)
    expect(message.endsWith("...[truncated]")).toBe(true)
  })

  test("#when a custom cap is given #then the cap is enforced", () => {
    const message = buildReflectorMessage({
      toolName: "edit_file",
      rawArgs: "garbage",
      error: "boom",
      schema,
      cap: 80,
    })
    expect(message.length).toBe(80 + "...[truncated]".length)
  })

  test("#when args are a JSON string wrapping the object #then the violation says so", () => {
    const message = buildReflectorMessage({
      toolName: "edit_file",
      rawArgs: JSON.stringify(JSON.stringify({ path: "a.ts", text: "x" })),
      error: "type error",
      schema,
    })
    expect(message).toContain("JSON string wrapping")
  })
})

type Snapshot = {
  name: string
  args: string
  stateToken?: string
}

function call(overrides: Partial<Snapshot> = {}): Snapshot {
  return { name: "read_file", args: '{"path":"a.ts"}', ...overrides }
}
