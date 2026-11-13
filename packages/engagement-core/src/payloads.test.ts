import { describe, expect, test } from "bun:test"

import {
  PayloadError,
  classifyReasonPayload,
  extractJsonObject,
  parseExplorePayload,
  parseVerifyPayload,
} from "./payloads"

describe("tolerant json extraction", () => {
  test("#given a bare json object #when extracted #then it parses", () => {
    expect(extractJsonObject('{"decision":"noop"}')).toEqual({ decision: "noop" })
  })

  test("#given a prose preamble #when extracted #then the object is still found", () => {
    const text = 'Sure, here is my answer:\n\n{"decision":"complete"}\n\nAnything else?'

    expect(extractJsonObject(text)).toEqual({ decision: "complete" })
  })

  test("#given braces inside a string #when extracted #then they do not break balancing", () => {
    const text = '{"title":"a { brace } inside","n":1}'

    expect(extractJsonObject(text)).toEqual({ title: "a { brace } inside", n: 1 })
  })

  test("#given an escaped quote inside a string #when extracted #then it does not end the string early", () => {
    const text = '{"note":"he said \\"hi\\" loudly","ok":true}'

    expect(extractJsonObject(text)).toEqual({ note: 'he said "hi" loudly', ok: true })
  })

  test("#given prose with stray braces before valid json #when extracted #then the valid object wins", () => {
    const text = 'Step {1} of {2}: {"decision":"noop"}'

    expect(extractJsonObject(text)).toEqual({ decision: "noop" })
  })

  test("#given no json at all #when extracted #then null is returned rather than throwing", () => {
    expect(extractJsonObject("no structured answer here")).toBeNull()
    expect(extractJsonObject("{ not valid json }")).toBeNull()
  })
})

describe("reason payload contract", () => {
  const facts = ["f001", "f002"]

  test("#given a complete decision #when classified #then it is accepted", () => {
    const payload = classifyReasonPayload({ decision: "complete" }, facts)

    expect(payload.decision).toBe("complete")
  })

  test("#given an unknown decision #when classified #then it is refused with the allowed set", () => {
    expect(() => classifyReasonPayload({ decision: "maybe" }, facts)).toThrow(PayloadError)
    expect(() => classifyReasonPayload({ decision: "maybe" }, facts)).toThrow(/complete\|intents\|noop\|rejected/)
  })

  test("#given a non-object #when classified #then it is refused", () => {
    expect(() => classifyReasonPayload("nope", facts)).toThrow(PayloadError)
    expect(() => classifyReasonPayload(["a"], facts)).toThrow(PayloadError)
  })

  test("#given an intent referencing an unknown fact #when classified #then it is dropped and the payload is refused as empty", () => {
    expect(() =>
      classifyReasonPayload(
        { decision: "intents", intents: [{ title: "t", description: "d", from: ["f999"] }] },
        facts,
      ),
    ).toThrow(/no valid intent/)
  })

  test("#given an intent referencing an unknown fact and nothing else #when classified #then it is refused", () => {
    expect(() =>
      classifyReasonPayload(
        { decision: "intents", intents: [{ title: "t", description: "d", from: ["f999"] }] },
        facts,
      ),
    ).toThrow(/no valid intent/)
  })

  test("#given an intent that depends on the reserved goal fact #when classified #then it is skipped", () => {
    expect(() =>
      classifyReasonPayload(
        { decision: "intents", intents: [{ title: "t", description: "d", from: ["goal"] }] },
        [...facts, "goal"],
      ),
    ).toThrow(/no valid intent/)
  })

  test("#given more intents than the cap #when classified #then at most three survive", () => {
    const intents = Array.from({ length: 6 }, (_, i) => ({
      title: `t${i}`,
      description: `d${i}`,
      from: ["f001"],
    }))
    const payload = classifyReasonPayload({ decision: "intents", intents }, facts)

    expect(payload.intents).toHaveLength(3)
  })

  test("#given a valid and an invalid intent #when classified #then the invalid one is dropped, not fatal", () => {
    const payload = classifyReasonPayload(
      {
        decision: "intents",
        intents: [
          { title: "good", description: "d", from: ["f001"] },
          { title: "", description: "d", from: ["f001"] },
        ],
      },
      facts,
    )

    expect(payload.intents).toHaveLength(1)
    expect(payload.intents[0]?.title).toBe("good")
  })
})

describe("explore payload contract", () => {
  test("#given a rejected execution #when parsed #then nothing is recorded", () => {
    expect(parseExplorePayload({ accepted: false, reason: "out of scope" })).toBeNull()
  })

  test("#given a fact without a title #when parsed #then it is rejected rather than recorded blank", () => {
    expect(parseExplorePayload({ description: "d" })).toBeNull()
    expect(parseExplorePayload({ title: "  ", description: "d" })).toBeNull()
  })

  test("#given a produced fact #when parsed #then its data is flattened to scalars", () => {
    const payload = parseExplorePayload({
      title: "http on 80",
      description: "nginx",
      kind: "service",
      data: { port: 80, product: "nginx" },
    })

    expect(payload?.kind).toBe("service")
    expect(payload?.data).toEqual({ port: "80", product: "nginx" })
  })

  test("#given a nested data value #when parsed #then it is dropped, not stringified", () => {
    const payload = parseExplorePayload({
      title: "t",
      description: "d",
      data: { nested: { a: 1 }, port: "80" },
    })

    expect(payload?.data).toEqual({ port: "80" })
  })
})

describe("verify payload contract", () => {
  test("#given a missing boolean #when parsed #then it is refused", () => {
    expect(() => parseVerifyPayload({ issues: [] })).toThrow(/boolean 'verified'/)
  })

  test("#given verified false without issues #when parsed #then it is refused as vague", () => {
    expect(() => parseVerifyPayload({ verified: false, issues: [] })).toThrow(/at least one issue/)
    expect(() => parseVerifyPayload({ verified: false })).toThrow(PayloadError)
  })

  test("#given verified true with issues #when parsed #then it is refused as contradictory", () => {
    expect(() => parseVerifyPayload({ verified: true, issues: ["something"] })).toThrow(/must not carry issues/)
  })

  test("#given verified false with a specific issue #when parsed #then it is accepted", () => {
    const payload = parseVerifyPayload({ verified: false, issues: ["the artifact is gone"] })

    expect(payload.verified).toBe(false)
    expect(payload.issues).toEqual(["the artifact is gone"])
  })

  test("#given verified true with no issues #when parsed #then it is accepted", () => {
    expect(parseVerifyPayload({ verified: true, issues: [] }).verified).toBe(true)
  })
})
