import { describe, expect, test } from "bun:test"

import { applySubtaskDelta, type Subtask } from "./plan-delta"

const plan = (...ids: string[]): Subtask[] =>
  ids.map((id) => ({ id, title: `title ${id}`, description: `description ${id}` }))

const ids = (list: readonly Subtask[]): string[] => list.map((entry) => entry.id)

describe("plan delta application", () => {
  test("#given adds anchored at the head and after an id #when applied #then they land in the instructed positions", () => {
    const before = plan("s1", "s2", "s3")

    const result = applySubtaskDelta(before, [
      { op: "add", id: "s0", title: "first", description: "d" },
      { op: "add", id: "s9", after_id: "s2", title: "later", description: "d" },
    ])

    expect(ids(result.plan)).toEqual(["s0", "s1", "s2", "s9", "s3"])
    expect(result.applied).toHaveLength(2)
    expect(result.rejected).toEqual([])
  })

  test("#given a delta #when applied #then the input plan is never mutated", () => {
    const before = plan("s1", "s2", "s3")
    const snapshot = JSON.stringify(before)

    const result = applySubtaskDelta(before, [
      { op: "remove", id: "s1" },
      { op: "add", id: "s4", after_id: "s3", title: "t", description: "d" },
      { op: "reorder", id: "s3", after_id: null },
    ])

    expect(JSON.stringify(before)).toBe(snapshot)
    expect(ids(before)).toEqual(["s1", "s2", "s3"])
    expect(result.plan).not.toBe(before)
    expect(ids(result.plan)).toEqual(["s3", "s2", "s4"])
  })

  test("#given an operation naming an unknown subtask #when applied #then it is rejected and the rest still lands", () => {
    const result = applySubtaskDelta(plan("s1"), [
      { op: "modify", id: "missing", title: "nope" },
      { op: "add", id: "s2", after_id: "s1", title: "kept", description: "d" },
    ])

    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]?.code).toBe("unknown-id")
    expect(result.applied).toHaveLength(1)
    expect(ids(result.plan)).toEqual(["s1", "s2"])
  })

  test("#given a remove naming an unknown subtask #when applied #then it is reported rather than thrown", () => {
    const result = applySubtaskDelta(plan("s1", "s2"), [{ op: "remove", id: "ghost" }])

    expect(result.rejected[0]?.code).toBe("unknown-id")
    expect(ids(result.plan)).toEqual(["s1", "s2"])
  })

  test("#given a rejection #when applied #then the offending operation is carried out verbatim", () => {
    const operation = { op: "remove", id: "ghost" }

    const result = applySubtaskDelta(plan("s1"), [operation])

    expect(result.rejected[0]?.operation).toBe(operation)
  })

  test("#given a reorder whose anchor is unknown #when applied #then it is rejected and the order stands", () => {
    const result = applySubtaskDelta(plan("s1", "s2", "s3"), [{ op: "reorder", id: "s3", after_id: "nope" }])

    expect(result.rejected[0]?.code).toBe("unknown-after-id")
    expect(ids(result.plan)).toEqual(["s1", "s2", "s3"])
  })

  test("#given an add whose anchor is unknown #when applied #then it is rejected", () => {
    const result = applySubtaskDelta(plan("s1"), [
      { op: "add", id: "s2", after_id: "nope", title: "t", description: "d" },
    ])

    expect(result.rejected[0]?.code).toBe("unknown-after-id")
    expect(ids(result.plan)).toEqual(["s1"])
  })

  test("#given a reorder a subtask to its own anchor #when applied #then it is rejected", () => {
    const result = applySubtaskDelta(plan("s1", "s2"), [{ op: "reorder", id: "s1", after_id: "s1" }])

    expect(result.rejected[0]?.code).toBe("self-reference")
    expect(ids(result.plan)).toEqual(["s1", "s2"])
  })

  test("#given a reorder #when applied #then untouched subtasks keep their relative order", () => {
    const result = applySubtaskDelta(plan("s1", "s2", "s3", "s4"), [{ op: "reorder", id: "s4", after_id: "s1" }])

    expect(ids(result.plan)).toEqual(["s1", "s4", "s2", "s3"])
    expect(result.applied).toHaveLength(1)
  })

  test("#given a reorder to the head #when applied #then the moved subtask leads and the rest keep order", () => {
    const result = applySubtaskDelta(plan("s1", "s2", "s3", "s4"), [{ op: "reorder", id: "s3", after_id: null }])

    expect(ids(result.plan)).toEqual(["s3", "s1", "s2", "s4"])
  })

  test("#given two adds claiming the same id #when applied #then the second is rejected as a duplicate", () => {
    const result = applySubtaskDelta([], [
      { op: "add", id: "s1", title: "first", description: "d" },
      { op: "add", id: "s1", title: "second", description: "d" },
    ])

    expect(result.rejected[0]?.code).toBe("duplicate-id")
    expect(ids(result.plan)).toEqual(["s1"])
    expect(new Set(ids(result.plan)).size).toBe(result.plan.length)
  })

  test("#given an add whose derived id is held by different content #when applied #then it lands on a free id", () => {
    const delta = [{ op: "add", title: "recon the host", description: "d" }]
    const first = applySubtaskDelta(plan("s1"), delta)
    const claimed = first.applied[0]?.id as string
    const edited = applySubtaskDelta(first.plan, [{ op: "modify", id: claimed, description: "reworded" }])

    const second = applySubtaskDelta(edited.plan, delta)

    expect(second.rejected).toEqual([])
    expect(second.applied).toHaveLength(1)
    expect(ids(second.plan)).toEqual([`${claimed}-2`, claimed, "s1"])
  })

  test("#given a modify #when applied #then only the named fields change", () => {
    const result = applySubtaskDelta(plan("s1", "s2"), [{ op: "modify", id: "s1", description: "sharper" }])

    expect(result.plan[0]).toEqual({ id: "s1", title: "title s1", description: "sharper" })
    expect(result.plan[1]).toEqual({ id: "s2", title: "title s2", description: "description s2" })
  })

  test("#given a modify of a subtask that does not exist #when applied #then it is rejected, not added", () => {
    const result = applySubtaskDelta(plan("s1"), [{ op: "modify", id: "s2", title: "t" }])

    expect(result.rejected[0]?.code).toBe("unknown-id")
    expect(ids(result.plan)).toEqual(["s1"])
  })

  test("#given a remove #when applied #then the subtask is gone and the rest keep their order", () => {
    const result = applySubtaskDelta(plan("s1", "s2", "s3"), [{ op: "remove", id: "s2" }])

    expect(ids(result.plan)).toEqual(["s1", "s3"])
    expect(result.applied[0]?.op).toBe("remove")
  })

  test("#given a numeric id #when applied #then it resolves against the string form", () => {
    const result = applySubtaskDelta(plan("7"), [{ op: "modify", id: 7, title: "numeric" }])

    expect(result.rejected).toEqual([])
    expect(result.plan[0]?.title).toBe("numeric")
  })

  test("#given after_id zero #when an add is applied #then it lands at the head", () => {
    const result = applySubtaskDelta(plan("s1", "s2"), [{ op: "add", id: "s0", after_id: 0, title: "t", description: "d" }])

    expect(ids(result.plan)).toEqual(["s0", "s1", "s2"])
  })

  test("#given an unknown op and a malformed element #when applied #then both are rejected and nothing is lost", () => {
    const result = applySubtaskDelta(plan("s1"), ["not an object", { op: "replace", id: "s1" }, { op: "remove", id: "s1" }])

    expect(result.rejected.map((entry) => entry.code)).toEqual(["unknown-op", "unknown-op"])
    expect(ids(result.plan)).toEqual([])
  })

  test("#given an add with no title #when applied #then it is rejected as incomplete", () => {
    const result = applySubtaskDelta(plan("s1"), [{ op: "add", id: "s2", description: "d" }])

    expect(result.rejected[0]?.code).toBe("missing-title")
    expect(ids(result.plan)).toEqual(["s1"])
  })

  test("#given an operation with no id #when it is not an add #then it is rejected as missing an id", () => {
    const result = applySubtaskDelta(plan("s1"), [{ op: "remove" }, { op: "reorder" }])

    expect(result.rejected.map((entry) => entry.code)).toEqual(["missing-id", "missing-id"])
    expect(ids(result.plan)).toEqual(["s1"])
  })

  test("#given an empty delta #when applied #then the plan is untouched and nothing is reported", () => {
    const before = plan("s1", "s2")
    const result = applySubtaskDelta(before, [])

    expect(ids(result.plan)).toEqual(["s1", "s2"])
    expect(result.applied).toEqual([])
    expect(result.rejected).toEqual([])
    expect(result.unchanged).toEqual([])
  })
})

describe("plan delta idempotence", () => {
  test("#given an add with no id #when the same delta is applied twice #then the replay is a detected no-op", () => {
    const delta = [{ op: "add", title: "pull the config", description: "dump the service config" }]

    const first = applySubtaskDelta(plan("s1"), delta)
    const second = applySubtaskDelta(first.plan, delta)

    expect(first.applied).toHaveLength(1)
    expect(second.applied).toEqual([])
    expect(second.rejected).toEqual([])
    expect(second.unchanged).toHaveLength(1)
    expect(second.unchanged[0]?.id).toBe(first.applied[0]?.id)
    expect(second.plan).toEqual(first.plan)
  })

  test("#given an explicit-id add #when the same delta is applied twice #then the second lands nothing", () => {
    const delta = [{ op: "add", id: "s5", after_id: "s1", title: "t", description: "d" }]

    const first = applySubtaskDelta(plan("s1"), delta)
    const second = applySubtaskDelta(first.plan, delta)

    expect(ids(first.plan)).toEqual(["s1", "s5"])
    expect(second.applied).toEqual([])
    expect(second.unchanged).toHaveLength(1)
    expect(second.plan).toEqual(first.plan)
  })

  test("#given a modify #when the same delta is applied twice #then the second is a no-op", () => {
    const delta = [{ op: "modify", id: "s1", description: "reworded" }]

    const first = applySubtaskDelta(plan("s1"), delta)
    const second = applySubtaskDelta(first.plan, delta)

    expect(first.applied).toHaveLength(1)
    expect(second.applied).toEqual([])
    expect(second.unchanged).toHaveLength(1)
    expect(second.plan).toEqual(first.plan)
  })

  test("#given a reorder to the position already held #when applied #then it is reported as unchanged", () => {
    const result = applySubtaskDelta(plan("s1", "s2", "s3"), [{ op: "reorder", id: "s2", after_id: "s1" }])

    expect(result.applied).toEqual([])
    expect(result.unchanged).toHaveLength(1)
    expect(ids(result.plan)).toEqual(["s1", "s2", "s3"])
  })

  test("#given a partially valid delta #when applied twice #then only the valid part is a no-op on replay", () => {
    const delta = [
      { op: "add", id: "s2", after_id: "s1", title: "t", description: "d" },
      { op: "reorder", id: "ghost", after_id: "s1" },
    ]

    const first = applySubtaskDelta(plan("s1"), delta)
    const second = applySubtaskDelta(first.plan, delta)

    expect(first.applied).toHaveLength(1)
    expect(first.rejected[0]?.code).toBe("unknown-id")
    expect(second.applied).toEqual([])
    expect(second.unchanged).toHaveLength(1)
    expect(second.rejected[0]?.code).toBe("unknown-id")
    expect(second.plan).toEqual(first.plan)
  })
})
