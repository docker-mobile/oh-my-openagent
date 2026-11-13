import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { GraphError } from "./index"
import { EngagementStore } from "./store"

let root: string
let store: EngagementStore

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omc-engagement-"))
  store = new EngagementStore({ root })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("engagement store", () => {
  test("#given no engagement #when a fact is recorded #then it refuses instead of half-initializing", () => {
    expect(() => store.addFact({ kind: "host", title: "10.0.0.1" })).toThrow(GraphError)
    expect(() => store.addFact({ kind: "host", title: "10.0.0.1" })).toThrow(/no engagement/)
  })

  test("#given an initialized engagement #when facts are recorded #then each gets its own node file", () => {
    store.init("own the target")
    const a = store.addFact({ kind: "host", title: "10.0.0.1" })
    const b = store.addFact({ kind: "service", title: "http/80" })

    const files = readdirSync(join(root, "facts")).filter((n) => n.endsWith(".json"))
    expect(files.sort()).toEqual([`${a}.json`, `${b}.json`].sort())
    expect(a).not.toBe(b)
  })

  test("#given a node id with a traversal segment #when read #then it is refused before touching the filesystem", () => {
    store.init("goal")
    expect(() => store.getFact("../../etc/passwd")).toThrow(GraphError)
    expect(() => store.getFact("../../etc/passwd")).toThrow(/unsafe node id/)
  })

  test("#given a counter that lags behind existing nodes #when the next node is added #then it skips to a free id", () => {
    store.init("goal")
    const first = store.addFact({ kind: "host", title: "one" })
    expect(first).toBe("f000")

    const projectPath = join(root, "project.json")
    const project = JSON.parse(require("node:fs").readFileSync(projectPath, "utf-8"))
    project.counters.fact = 0
    writeFileSync(projectPath, JSON.stringify(project, null, 2))

    const second = store.addFact({ kind: "host", title: "two" })
    expect(second).not.toBe(first)
    expect(store.getFact(first)?.title).toBe("one")
  })

  test("#given an intent depending on an unknown fact #when added #then it is refused", () => {
    store.init("goal")
    expect(() => store.addIntent({ title: "scan", from: ["f999"] })).toThrow(/unknown fact/)
  })

  test("#given persisted nodes #when the graph is reloaded #then the facts survive", () => {
    store.init("own the target")
    store.addFact({ kind: "host", title: "10.0.0.9", data: { ip: "10.0.0.9" } })

    const graph = store.load()
    expect(graph.allFacts().map((f) => f.title)).toContain("10.0.0.9")
  })

  test("#given facts on disk #when a snapshot is taken #then the goal and nodes are reported", () => {
    store.init("capture the flag")
    store.addFact({ kind: "cred", title: "admin cred", data: { username: "admin", password: "x" } })

    const snap = store.snapshot()
    expect(snap.goal).toBe("capture the flag")
    expect(snap.status).toBe("active")
    expect(snap.facts).toHaveLength(1)
  })

  test("#given an engagement #when destroyed #then its directory is gone", () => {
    store.init("goal")
    expect(existsSync(root)).toBe(true)
    store.destroy()
    expect(existsSync(root)).toBe(false)
  })
})
