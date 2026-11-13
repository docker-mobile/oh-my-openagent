import { describe, expect, test } from "bun:test"

import {
  recall,
  recallFromStore,
  recallScore,
  recallTokenize,
  renderHistoryBlock,
  renderRecall,
  similarityRatio,
  toCandidates,
  type RecallCandidate,
} from "./recall"
import { EngagementStore } from "./store"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function candidate(over: Partial<RecallCandidate> = {}): RecallCandidate {
  return {
    id: "f001",
    kind: "fact",
    title: "nginx on 80",
    description: "service port=80",
    doc: null,
    tags: ["service"],
    ...over,
  }
}

describe("tokenization", () => {
  test("#given english text #when tokenized #then words are lowercased and punctuation dropped", () => {
    expect(recallTokenize("Nmap -sV target.local!")).toEqual(["nmap", "sv", "target", "local"])
  })

  test("#given CJK text #when tokenized #then each character is its own token", () => {
    expect(recallTokenize("提权思路")).toEqual(["提", "权", "思", "路"])
  })

  test("#given mixed CJK and latin #when tokenized #then both forms are produced without loss", () => {
    expect(recallTokenize("linux提权")).toEqual(["linux", "提", "权"])
  })

  test("#given only punctuation #when tokenized #then there are no tokens", () => {
    expect(recallTokenize("--- !!!")).toEqual([])
  })
})

describe("similarity ratio", () => {
  test("#given identical strings #when compared #then the ratio is 1", () => {
    expect(similarityRatio("thinkphp rce", "thinkphp rce")).toBe(1)
  })

  test("#given an empty side #when compared #then the ratio is 0", () => {
    expect(similarityRatio("", "anything")).toBe(0)
  })

  test("#given a one-character edit #when compared #then the ratio stays high", () => {
    expect(similarityRatio("thinkphp rce", "thinkphp rces")).toBeGreaterThan(0.9)
  })

  test("#given unrelated strings #when compared #then the ratio is low", () => {
    expect(similarityRatio("kerberos delegation", "php filter chain")).toBeLessThan(0.45)
  })
})

describe("scoring", () => {
  test("#given a title match #when scored #then it outweighs a description-only match", () => {
    const titleHit = recallScore("nmap", candidate({ title: "nmap scan" }))
    const descHit = recallScore("nmap", candidate({ title: "unrelated", description: "nmap mention" }))

    expect(titleHit).toBeGreaterThan(descHit)
  })

  test("#given no exact overlap but a close title #when scored #then the fuzzy fallback still fires", () => {
    const score = recallScore("thinkphp rce", candidate({ title: "think php rce", description: "z", tags: [] }))
    expect(score).toBeGreaterThan(0)
  })

  test("#given unrelated work #when scored #then the score is zero", () => {
    expect(recallScore("kerberos delegation", candidate({ title: "nginx banner", description: "port 80", tags: [] }))).toBe(0)
  })

  test("#given an empty query #when scored #then nothing matches", () => {
    expect(recallScore("   ", candidate())).toBe(0)
  })

  test("#given a tag-only match #when scored #then it still counts", () => {
    expect(recallScore("service", candidate({ title: "z", description: "z" }))).toBeGreaterThan(0)
  })

  test("#given a doc beyond the head window #when scored #then only the first 500 chars are searched", () => {
    const deep = "x".repeat(600) + " kerberoast"
    expect(recallScore("kerberoast", candidate({ title: "z", description: "z", tags: [], doc: deep }))).toBe(0)
  })

  test("#given a term inside the doc head #when scored #then it is found", () => {
    expect(recallScore("kerberoast", candidate({ title: "z", description: "z", tags: [], doc: "kerberoast via SPN" }))).toBeGreaterThan(0)
  })
})

describe("recall ranking", () => {
  const candidates = [
    candidate({ id: "f001", title: "nmap scan of 10.0.0.5", description: "recon" }),
    candidate({ id: "f002", title: "totally unrelated", description: "kerberos notes" }),
    candidate({ id: "f003", title: "nmap follow-up", description: "recon" }),
  ]

  test("#given several matches #when recalled #then the best score comes first", () => {
    const hits = recall("nmap scan", candidates)
    expect(hits[0]?.candidate.id).toBe("f001")
  })

  test("#given a limit #when recalled #then at most that many hits return", () => {
    expect(recall("nmap", candidates, { limit: 1 })).toHaveLength(1)
  })

  test("#given a minimum score #when recalled #then weaker hits are excluded", () => {
    const hits = recall("nmap", candidates, { minScore: 100 })
    expect(hits).toEqual([])
  })

  test("#given no match #when recalled #then nothing is returned", () => {
    expect(recall("kubernetes rbac", candidates)).toEqual([])
  })

  test("#given equal scores #when recalled #then ordering is stable by id", () => {
    const tied = [candidate({ id: "f002", title: "same" }), candidate({ id: "f001", title: "same" })]
    expect(recall("same", tied).map((h) => h.candidate.id)).toEqual(["f001", "f002"])
  })
})

describe("rendering", () => {
  test("#given no hits #when rendered #then it says so", () => {
    expect(renderRecall([])).toBe("(no prior work matches)")
  })

  test("#given hits #when rendered #then each line carries id, kind, title and score", () => {
    const out = renderRecall([{ candidate: candidate(), score: 3 }])
    expect(out).toContain("f001")
    expect(out).toContain("[fact]")
    expect(out).toContain("3.00")
  })

  test("#given no history #when rendered #then the block is empty rather than a stray header", () => {
    expect(renderHistoryBlock([])).toBe("")
  })

  test("#given history entries #when rendered #then each is listed under a header", () => {
    const out = renderHistoryBlock([{ id: "i001", title: "scan it" }])
    expect(out).toContain("Recent:")
    expect(out).toContain("i001")
  })
})

describe("recall against a store", () => {
  test("#given persisted work #when recalled #then facts and intents are both searchable", () => {
    const root = mkdtempSync(join(tmpdir(), "omc-recall-"))
    try {
      const store = new EngagementStore({ root })
      store.init("own the target")
      store.addFact({ kind: "host", title: "10.0.0.5 alive", data: { ip: "10.0.0.5" } })

      const fromFacts = recallFromStore("10.0.0.5", store)
      expect(fromFacts.length).toBeGreaterThan(0)
      expect(fromFacts[0]?.candidate.kind).toBe("fact")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("#given facts and intents #when converted #then each keeps its kind label", () => {
    const candidates = toCandidates(
      [{ id: "f001", kind: "host", title: "h", doc: null, data: { ip: "1.2.3.4" }, settled: true, createdAt: "2026-01-01T00:00:00Z" }],
      [{ id: "i001", title: "scan", from: ["f001"], to: null, toGoal: false, claimedBy: null, createdAt: "2026-01-01T00:00:00Z" }],
    )

    expect(candidates.map((c) => c.kind)).toEqual(["fact", "intent"])
    expect(candidates[0]?.description).toContain("ip=1.2.3.4")
  })
})
