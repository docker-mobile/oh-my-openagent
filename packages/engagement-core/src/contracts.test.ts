import { describe, expect, test } from "bun:test"

import {
  ContractError,
  GOAL_FACT_ID,
  MAX_REASON_INTENTS,
  applyReasonIntents,
  classifyReasonContract,
  parseExploreContract,
  parseVerifyContract,
} from "./contracts"

const FACTS = ["f-001", "f-002", "f-003"]

describe("reason classification", () => {
  test("#given an explicitly rejected payload #when classified #then the verdict is rejected", () => {
    const contract = classifyReasonContract({ accepted: false, reason: "task is already covered" })

    expect(contract.verdict).toBe("rejected")
    expect(contract.reason).toBe("task is already covered")
  })

  test("#given every verdict the contract allows #when classified #then each maps to its own verdict", () => {
    expect(classifyReasonContract({ complete: { from: ["f-001"], description: "done" } }).verdict).toBe("complete")
    expect(classifyReasonContract({ data: { intents: [] } }).verdict).toBe("intents")
    expect(classifyReasonContract({ accepted: true, data: {} }).verdict).toBe("noop")
    expect(classifyReasonContract({ accepted: false }).verdict).toBe("rejected")
  })

  test("#given a complete reply #when classified #then its dependencies and note are captured", () => {
    const contract = classifyReasonContract({
      complete: { from: ["f-001", "f-002"], description: "  goal satisfied  " },
    })

    expect(contract.completion).toEqual({ from: ["f-001", "f-002"], description: "goal satisfied" })
  })

  test("#given a complete reply whose from is not a list #when classified #then it is refused", () => {
    expect(() => classifyReasonContract({ complete: { from: "f-001", description: "done" } })).toThrow(ContractError)
  })

  test("#given a complete reply without a description #when classified #then it is refused", () => {
    expect(() => classifyReasonContract({ complete: { from: ["f-001"], description: "   " } })).toThrow(
      /non-empty 'description'/,
    )
  })

  test("#given a reply naming no decision #when classified #then it is refused instead of defaulting to noop", () => {
    expect(() => classifyReasonContract({})).toThrow(ContractError)
    expect(() => classifyReasonContract({ note: "I did some things" })).toThrow(ContractError)
    expect(() => classifyReasonContract({ intents: "all of them" })).toThrow(ContractError)
  })

  test("#given a non-object #when classified #then it is refused", () => {
    expect(() => classifyReasonContract("noop")).toThrow(ContractError)
    expect(() => classifyReasonContract([{ complete: {} }])).toThrow(ContractError)
    expect(() => classifyReasonContract(null)).toThrow(ContractError)
  })
})

describe("reason intent application", () => {
  test("#given a valid intent beside four invalid ones #when applied #then only the valid one is accepted, each skip named", () => {
    const application = applyReasonIntents(
      [
        { title: "pivot", description: "attack the management port", from: ["f-001"] },
        { title: "unknown dep", description: "d", from: ["f-404"] },
        { title: "goal dep", description: "d", from: [GOAL_FACT_ID] },
        { title: "no description", description: "   ", from: ["f-001"] },
        "not an object",
      ],
      FACTS,
    )

    expect(application.accepted).toHaveLength(1)
    expect(application.accepted[0]?.from).toEqual(["f-001"])
    expect(application.rejected.map((skip) => skip.index)).toEqual([1, 2, 3, 4])
    expect(application.rejected[0]?.reason).toContain("unknown fact id")
    expect(application.rejected[1]?.reason).toContain("reserved goal id")
    expect(application.rejected[2]?.reason).toContain("description")
    expect(application.rejected[3]?.reason).toContain("must be an object")
  })

  test("#given more intents than the cap #when applied #then the cap is enforced and the overflow is named", () => {
    const proposed = Array.from({ length: MAX_REASON_INTENTS + 2 }, (_, index) => ({
      title: `t${index}`,
      description: `d${index}`,
      from: ["f-001"],
    }))

    const application = applyReasonIntents(proposed, FACTS)

    expect(application.accepted).toHaveLength(MAX_REASON_INTENTS)
    expect(application.rejected).toHaveLength(2)
    expect(application.rejected[0]?.reason).toContain("cap")
  })

  test("#given an intent with no dependency #when applied #then it is skipped rather than applied against everything", () => {
    const application = applyReasonIntents([{ title: "t", description: "d", from: [] }], FACTS)

    expect(application.accepted).toHaveLength(0)
    expect(application.rejected[0]?.reason).toContain("non-empty 'from'")
  })

  test("#given an intent whose from holds a non-string #when applied #then it is skipped", () => {
    const application = applyReasonIntents([{ title: "t", description: "d", from: ["f-001", 7] }], FACTS)

    expect(application.accepted).toHaveLength(0)
    expect(application.rejected).toHaveLength(1)
  })

  test("#given a batch that is not a list #when applied #then the application itself is refused", () => {
    expect(() => applyReasonIntents({ description: "one intent" }, FACTS)).toThrow(ContractError)
  })

  test("#given a titleless but otherwise valid intent #when applied #then it is accepted with a null title", () => {
    const application = applyReasonIntents([{ description: "d", from: ["f-001"] }], FACTS)

    expect(application.accepted[0]?.title).toBeNull()
    expect(application.rejected).toHaveLength(0)
  })
})

describe("explore contract", () => {
  const COMPLETE = {
    title: "http on 80",
    description: "nginx 1.18 reachable",
    kind: "service",
    data: { port: 80, product: "nginx" },
    doc: "nmap -sV 10.0.2.15",
  }

  test("#given every required field #when parsed #then the fact is accepted", () => {
    const fact = parseExploreContract(COMPLETE)

    expect(fact?.kind).toBe("service")
    expect(fact?.data).toEqual({ port: "80", product: "nginx" })
    expect(fact?.doc).toBe("nmap -sV 10.0.2.15")
  })

  test("#given any one required field missing #when parsed #then it is rejected rather than defaulted", () => {
    for (const field of ["title", "description", "kind", "data", "doc"]) {
      const partial: Record<string, unknown> = { ...COMPLETE }
      delete partial[field]

      expect(parseExploreContract(partial)).toBeNull()
      expect(parseExploreContract({ ...partial, [field]: "   " })).toBeNull()
    }
  })

  test("#given a rejected execution #when parsed #then nothing is recorded", () => {
    expect(parseExploreContract({ accepted: false, reason: "out of scope" })).toBeNull()
    expect(parseExploreContract({ ...COMPLETE, accepted: false })).toBeNull()
  })

  test("#given a wrapper payload #when parsed #then the inner data is the fact", () => {
    const fact = parseExploreContract({ accepted: true, data: COMPLETE })

    expect(fact?.title).toBe("http on 80")
  })

  test("#given nested data values #when parsed #then they are dropped instead of stringified", () => {
    const fact = parseExploreContract({ ...COMPLETE, data: { port: "80", nested: { a: 1 } } })

    expect(fact?.data).toEqual({ port: "80" })
  })

  test("#given deviations #when parsed #then they append to the doc instead of replacing it", () => {
    const fact = parseExploreContract({
      ...COMPLETE,
      deviations: [{ planned: "exploit CVE-x", actual: "used creds", reason: "patch had landed" }],
    })

    expect(fact?.doc).toContain("nmap -sV 10.0.2.15")
    expect(fact?.doc).toContain("## Deviations")
    expect(fact?.doc).toContain("used creds")
    expect(fact?.doc).toContain("patch had landed")
  })

  test("#given no deviations #when parsed #then the doc is left exactly as the executor wrote it", () => {
    expect(parseExploreContract(COMPLETE)?.doc).toBe(COMPLETE.doc)
    expect(parseExploreContract({ ...COMPLETE, deviations: [] })?.doc).toBe(COMPLETE.doc)
  })

  test("#given a non-object #when parsed #then it is rejected", () => {
    expect(parseExploreContract("a fact, honestly")).toBeNull()
    expect(parseExploreContract(null)).toBeNull()
  })
})

describe("verify contract", () => {
  test("#given no boolean verified #when parsed #then it is refused", () => {
    expect(() => parseVerifyContract({ issues: [] })).toThrow(/boolean 'verified'/)
    expect(() => parseVerifyContract({ verified: "yes" })).toThrow(ContractError)
  })

  test("#given verified false without a single issue #when parsed #then it is refused as vague", () => {
    expect(() => parseVerifyContract({ verified: false })).toThrow(/at least one issue/)
    expect(() => parseVerifyContract({ verified: false, issues: [] })).toThrow(/at least one issue/)
    expect(() => parseVerifyContract({ verified: false, issues: "   " })).toThrow(/at least one issue/)
  })

  test("#given verified true carrying issues #when parsed #then it is refused as contradictory", () => {
    expect(() => parseVerifyContract({ verified: true, issues: ["the artifact is gone"] })).toThrow(
      /must not carry issues/,
    )
    expect(() => parseVerifyContract({ verified: true, issues: "the artifact is gone" })).toThrow(
      /must not carry issues/,
    )
  })

  test("#given a decisive report #when parsed #then the verdict and its issues survive", () => {
    const failed = parseVerifyContract({ verified: false, issues: ["the artifact is gone"] })
    const passed = parseVerifyContract({ verified: true, issues: [] })

    expect(failed).toEqual({ verified: false, issues: ["the artifact is gone"] })
    expect(passed).toEqual({ verified: true, issues: [] })
  })

  test("#given issues sent as one string #when parsed #then it is read as a single issue", () => {
    expect(parseVerifyContract({ verified: false, issues: "  exploit did not land  " }).issues).toEqual([
      "exploit did not land",
    ])
  })

  test("#given issues of an unusable type #when parsed #then it is refused instead of read as empty", () => {
    expect(() => parseVerifyContract({ verified: false, issues: 42 })).toThrow(ContractError)
    expect(() => parseVerifyContract({ verified: true, issues: 42 })).toThrow(ContractError)
  })

  test("#given a wrapper payload #when parsed #then the inner data is the report", () => {
    expect(parseVerifyContract({ data: { verified: true } }).verified).toBe(true)
  })

  test("#given a non-object #when parsed #then it is refused", () => {
    expect(() => parseVerifyContract("verified")).toThrow(ContractError)
    expect(() => parseVerifyContract(null)).toThrow(ContractError)
  })
})
