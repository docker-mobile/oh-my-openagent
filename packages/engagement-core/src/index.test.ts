import { describe, expect, test } from "bun:test"

import {
  EngagementGraph,
  FACT_KINDS,
  GraphError,
  normalizeFactData,
  normalizeFactKind,
} from "./index"

describe("fact kinds", () => {
  test("#given the offensive kind set #when inspected #then every attack artifact kind is present", () => {
    expect([...FACT_KINDS].sort()).toEqual(["cred", "flag", "host", "loot", "note", "service", "vuln"])
  })

  test("#given a mixed-case kind #when normalized #then it is canonicalized", () => {
    expect(normalizeFactKind("HOST")).toBe("host")
    expect(normalizeFactKind(" Vuln ")).toBe("vuln")
  })

  test("#given an empty kind #when normalized #then it is treated as untyped", () => {
    expect(normalizeFactKind("")).toBeNull()
    expect(normalizeFactKind(null)).toBeNull()
  })

  test("#given an unknown kind #when normalized #then it is rejected with the allowed set named", () => {
    expect(() => normalizeFactKind("exploit")).toThrow(GraphError)
    expect(() => normalizeFactKind("exploit")).toThrow(/host, service, cred/)
  })
})

describe("fact data", () => {
  test("#given scalar values of several types #when normalized #then all become strings", () => {
    expect(normalizeFactData({ port: 443, tls: true, banner: "nginx" }))
      .toEqual({ port: "443", tls: "true", banner: "nginx" })
  })

  test("#given a nested value #when normalized #then it is rejected", () => {
    expect(() => normalizeFactData({ host: { ip: "10.0.0.1" } })).toThrow(/scalar/)
  })

  test("#given a key with shell-hostile characters #when normalized #then it is rejected", () => {
    expect(() => normalizeFactData({ "a;rm -rf /": "x" })).toThrow(/must match/)
  })

  test("#given only null values #when normalized #then the data is absent rather than empty", () => {
    expect(normalizeFactData({ note: null })).toBeNull()
  })
})

describe("engagement graph", () => {
  const build = () => new EngagementGraph({ storeDir: "/tmp/unused-in-unit-tests" })

  test("#given a new graph #when a fact is recorded #then it returns a stable id and is retrievable", () => {
    const g = build()
    const id = g.addFact({ kind: "host", title: "10.0.0.5 alive", data: { ip: "10.0.0.5" } })

    expect(id).toMatch(/^f-/)
    expect(g.getFact(id)?.kind).toBe("host")
    expect(g.getFact(id)?.data).toEqual({ ip: "10.0.0.5" })
  })

  test("#given a service fact #when recorded #then it links back to its host fact", () => {
    const g = build()
    const hostId = g.addFact({ kind: "host", title: "target", data: { ip: "10.0.0.5" } })
    const svcId = g.addFact({
      kind: "service",
      title: "http on 80",
      data: { host: hostId, port: "80", product: "nginx" },
    })

    expect(g.getFact(svcId)?.data?.host).toBe(hostId)
  })

  test("#given a credential #when recorded #then the secret is not exposed by the summary view", () => {
    const g = build()
    const id = g.addFact({
      kind: "cred",
      title: "admin: found in /backup",
      data: { username: "admin", password: "hunter2", source: "/backup" },
    })

    const summary = g.summary()
    expect(JSON.stringify(summary)).not.toContain("hunter2")
    expect(g.getFact(id)?.data?.password).toBe("hunter2")
  })

  test("#given an intent whose dependency is unresolved #when frontier is asked #then it is not ready", () => {
    const g = build()
    const openFactId = g.addFact({ kind: "note", title: "unresolved lead" })
    const intentId = g.addIntent({ title: "enumerate the port", from: [openFactId] })

    g.releaseFact(openFactId)

    expect(g.frontier().map((i) => i.id)).not.toContain(intentId)
  })

  test("#given an intent whose dependencies are all settled #when frontier is asked #then it is ready", () => {
    const g = build()
    const factId = g.addFact({ kind: "host", title: "alive" })
    const intentId = g.addIntent({ title: "scan it", from: [factId] })

    expect(g.frontier().map((i) => i.id)).toContain(intentId)
  })

  test("#given a claimed intent #when another worker tries to claim it #then the claim is refused", () => {
    const g = build()
    const factId = g.addFact({ kind: "host", title: "alive" })
    const intentId = g.addIntent({ title: "scan it", from: [factId] })

    expect(g.claim(intentId, "worker-a")).toBe(true)
    expect(g.claim(intentId, "worker-b")).toBe(false)
    expect(g.getIntent(intentId)?.claimedBy).toBe("worker-a")
  })

  test("#given a claimed intent released by its owner #when inspection runs #then it is open again", () => {
    const g = build()
    const factId = g.addFact({ kind: "host", title: "alive" })
    const intentId = g.addIntent({ title: "scan it", from: [factId] })
    g.claim(intentId, "worker-a")

    g.release(intentId, "worker-a")

    expect(g.getIntent(intentId)?.claimedBy).toBeNull()
  })

  test("#given an intent completed with a produced fact #when done #then the edge closes and the fact exists", () => {
    const g = build()
    const src = g.addFact({ kind: "host", title: "alive" })
    const intentId = g.addIntent({ title: "fingerprint it", from: [src] })

    const producedId = g.done(intentId, { kind: "service", title: "http/80", data: { port: "80" } })

    expect(g.getIntent(intentId)?.to).toBe(producedId)
    expect(g.getFact(producedId)?.kind).toBe("service")
  })

  test("#given the same flag twice #when recorded #then the ledger dedupes it", () => {
    const g = build()
    const first = g.recordFlag("flag{abc}", "c01")
    const second = g.recordFlag("flag{abc}", "c01")

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(g.flags()).toHaveLength(1)
  })

  test("#given a flag #when recorded #then it is stored before any submission is attempted", () => {
    const g = build()
    g.recordFlag("flag{late}", "c02")

    expect(g.flags()[0]).toMatchObject({ value: "flag{late}", status: "recorded", submitted: false })
  })

  test("#given facts of several kinds #when counted #then the intel rollup reports each kind", () => {
    const g = build()
    g.addFact({ kind: "host", title: "h1" })
    g.addFact({ kind: "host", title: "h2" })
    g.addFact({ kind: "cred", title: "c1" })

    const intel = g.intel()
    expect(intel.host).toBe(2)
    expect(intel.cred).toBe(1)
    expect(intel.vuln).toBe(0)
  })

  test("#given a goal intent with no remaining work #when completion is checked #then the engagement is complete", () => {
    const g = build()
    const root = g.addFact({ kind: "host", title: "target" })
    const finalIntent = g.addIntent({ title: "capture objective", from: [root], toGoal: true })

    expect(g.isComplete()).toBe(false)
    g.done(finalIntent, { kind: "flag", title: "objective captured" })
    expect(g.isComplete()).toBe(true)
  })
})
