import { describe, expect, test } from "bun:test"

import { EngagementGraph } from "./index"
import {
  CommanderError,
  commanderTick,
  parseCommandPayload,
  renderBoard,
  roundRobinDecision,
  summarizeBoard,
  type EngagementView,
} from "./commander"

function view(target: string, build?: (g: EngagementGraph) => void): EngagementView {
  const graph = new EngagementGraph({ storeDir: `/tmp/${target}` })
  build?.(graph)
  return { target, graph }
}

function withOpenIntent(g: EngagementGraph): void {
  const factId = g.addFact({ kind: "host", title: "alive" })
  g.addIntent({ title: "scan", from: [factId] })
}

describe("board reduction", () => {
  test("#given an active engagement #when summarized #then its open intents and flag count are reported", () => {
    const rows = summarizeBoard([
      view("c01", (g) => {
        withOpenIntent(g)
        g.recordFlag("flag{a}", "c01")
      }),
    ])

    expect(rows[0]?.target).toBe("c01")
    expect(rows[0]?.status).toBe("active")
    expect(rows[0]?.openIntents).toBe(1)
    expect(rows[0]?.flags).toBe(1)
  })

  test("#given a completed engagement #when summarized #then it is marked complete", () => {
    const rows = summarizeBoard([
      view("c02", (g) => {
        const root = g.addFact({ kind: "host", title: "target" })
        const goal = g.addIntent({ title: "capture", from: [root], toGoal: true })
        g.done(goal, { kind: "flag", title: "captured" })
      }),
    ])

    expect(rows[0]?.status).toBe("complete")
  })

  test("#given facts of several kinds #when summarized #then the per-kind capture rollup is carried", () => {
    const rows = summarizeBoard([
      view("c03", (g) => {
        g.addFact({ kind: "host", title: "h" })
        g.addFact({ kind: "cred", title: "c" })
      }),
    ])

    expect(rows[0]?.captures.host).toBe(1)
    expect(rows[0]?.captures.cred).toBe(1)
  })

  test("#given no engagements #when rendered #then the board says so rather than being blank", () => {
    expect(renderBoard([])).toBe("(no engagements)")
  })

  test("#given rows #when rendered #then each engagement is one line carrying its worker column", () => {
    const rows = summarizeBoard([{ ...view("c04", withOpenIntent), workers: ["w-a"] }])
    const board = renderBoard(rows)

    expect(board.split("\n")).toHaveLength(1)
    expect(board).toContain("c04")
    expect(board).toContain("w[w-a]")
    expect(board).toContain("open:1")
  })

  test("#given an engagement with no workers #when rendered #then the worker column shows a dash", () => {
    expect(renderBoard(summarizeBoard([view("c05")]))).toContain("w[-]")
  })
})

describe("command payload contract", () => {
  const targets = ["c01", "c02"]

  test("#given a valid work decision #when parsed #then it is accepted", () => {
    const decision = parseCommandPayload({ action: "work", target: "c01", minutes: 10 }, targets)

    expect(decision.action).toBe("work")
    expect(decision.target).toBe("c01")
    expect(decision.minutes).toBe(10)
    expect(decision.degraded).toBe(false)
  })

  test("#given an unknown action #when parsed #then it is refused with the allowed set", () => {
    expect(() => parseCommandPayload({ action: "nuke", target: "c01" }, targets)).toThrow(CommanderError)
    expect(() => parseCommandPayload({ action: "nuke", target: "c01" }, targets)).toThrow(/work, hire, fire, stop/)
  })

  test("#given an unknown target #when parsed #then it is refused", () => {
    expect(() => parseCommandPayload({ action: "work", target: "c99" }, targets)).toThrow(/unknown target/)
  })

  test("#given a missing target #when parsed #then it is refused", () => {
    expect(() => parseCommandPayload({ action: "work" }, targets)).toThrow(/needs a target/)
  })

  test("#given an absurd slice length #when parsed #then it is clamped, not trusted", () => {
    expect(parseCommandPayload({ action: "work", target: "c01", minutes: 100_000 }, targets).minutes).toBe(240)
    expect(parseCommandPayload({ action: "work", target: "c01", minutes: -5 }, targets).minutes).toBe(1)
  })

  test("#given no slice length #when parsed #then a minimum slice is used rather than zero", () => {
    expect(parseCommandPayload({ action: "work", target: "c01" }, targets).minutes).toBe(1)
  })

  test("#given a non-object payload #when parsed #then it is refused", () => {
    expect(() => parseCommandPayload("work c01", targets)).toThrow(CommanderError)
  })
})

describe("round-robin fallback", () => {
  const rows = [
    { target: "c01", status: "active", openIntents: 1, flags: 0, captures: {}, workers: [] },
    { target: "c02", status: "active", openIntents: 2, flags: 1, captures: {}, workers: [] },
  ] as const

  test("#given active engagements #when the cursor advances #then different targets are chosen", () => {
    expect(roundRobinDecision([...rows], 0)?.target).toBe("c01")
    expect(roundRobinDecision([...rows], 1)?.target).toBe("c02")
  })

  test("#given every engagement is complete #when choosing #then there is nothing to do", () => {
    const done = [{ ...rows[0], status: "complete" }] as unknown as typeof rows
    expect(roundRobinDecision([...done], 0)).toBeNull()
  })

  test("#given a worker already on one target #when choosing #then an idle target is preferred", () => {
    const withWorker = [
      { ...rows[0], workers: ["w-a"] },
      { ...rows[1], workers: [] },
    ]
    expect(roundRobinDecision(withWorker, 0, { workers: ["w-a"] })?.target).toBe("c02")
  })

  test("#given a fallback decision #when inspected #then it is marked degraded and says why", () => {
    const decision = roundRobinDecision([...rows], 0)
    expect(decision?.degraded).toBe(true)
    expect(decision?.note).toMatch(/round-robin/)
  })

  test("#given a fallback on an empty board #when choosing #then it returns nothing instead of throwing", () => {
    expect(roundRobinDecision([], 0)).toBeNull()
  })
})

describe("commander tick", () => {
  const engagements = [view("c01", withOpenIntent), view("c02", withOpenIntent)]

  test("#given a working planner #when ticking #then its decision is used", async () => {
    const result = await commanderTick({
      engagements,
      plan: () => ({ action: "hire", target: "c02", minutes: 30, note: "hot target" }),
    })

    expect(result.decision?.action).toBe("hire")
    expect(result.decision?.target).toBe("c02")
    expect(result.decision?.minutes).toBe(30)
    expect(result.decision?.degraded).toBe(false)
    expect(result.planError).toBeNull()
  })

  test("#given a planner that throws #when ticking #then it degrades and reports the error", async () => {
    const result = await commanderTick({
      engagements,
      plan: () => {
        throw new Error("planner offline")
      },
    })

    expect(result.decision?.degraded).toBe(true)
    expect(result.planError).toBe("planner offline")
  })

  test("#given a planner returning garbage #when ticking #then it degrades instead of acting on it", async () => {
    const result = await commanderTick({
      engagements,
      plan: () => ({ action: "nuke", target: "c99" }),
    })

    expect(result.decision?.degraded).toBe(true)
    expect(result.planError).toMatch(/unknown action/)
  })

  test("#given no planner at all #when ticking #then round-robin runs and no error is reported", async () => {
    const result = await commanderTick({ engagements })

    expect(result.decision?.degraded).toBe(true)
    expect(result.planError).toBeNull()
  })

  test("#given a tick #when it runs #then the rendered board is returned for the record", async () => {
    const result = await commanderTick({ engagements })

    expect(result.rows).toHaveLength(2)
    expect(result.board).toContain("c01")
  })

  test("#given an already completed engagement only #when ticking #then the decision is null, not an error", async () => {
    const done = [
      view("c09", (g) => {
        const root = g.addFact({ kind: "host", title: "t" })
        const goal = g.addIntent({ title: "capture", from: [root], toGoal: true })
        g.done(goal, { kind: "flag", title: "got it" })
      }),
    ]
    const result = await commanderTick({ engagements: done })

    expect(result.decision).toBeNull()
    expect(result.planError).toBeNull()
  })
})
