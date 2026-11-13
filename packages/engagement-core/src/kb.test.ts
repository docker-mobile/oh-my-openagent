import { describe, expect, test } from "bun:test"

import { KnowledgeBase, KnowledgeBaseError } from "./kb"

describe("kb entries", () => {
  test("#given a new entry #when added #then it gets a stable kb id", () => {
    const kb = new KnowledgeBase()
    const entry = kb.add({ title: "ThinkPHP RCE", description: "chain to RCE" })

    expect(entry.id).toMatch(/^kb\d{3}$/)
    expect(kb.get(entry.id)?.title).toBe("ThinkPHP RCE")
  })

  test("#given an entry without a title #when added #then it is refused", () => {
    const kb = new KnowledgeBase()
    expect(() => kb.add({ title: "  ", description: "x" })).toThrow(/needs a title/)
  })

  test("#given an entry without a description #when added #then it is refused", () => {
    const kb = new KnowledgeBase()
    expect(() => kb.add({ title: "x", description: "" })).toThrow(/needs a description/)
  })

  test("#given a tag with capitals and spaces #when added #then it is canonicalized and deduped", () => {
    const kb = new KnowledgeBase()
    const entry = kb.add({ title: "t", description: "d", tags: [" Web ", "web", "RCE"] })

    expect(entry.tags).toEqual(["web", "rce"])
  })

  test("#given a malformed tag #when added #then it is refused", () => {
    const kb = new KnowledgeBase()
    expect(() => kb.add({ title: "t", description: "d", tags: ["-bad"] })).toThrow(KnowledgeBaseError)
    expect(() => kb.add({ title: "t", description: "d", tags: ["has space"] })).toThrow(/invalid tag/)
  })

  test("#given a path-like id #when read #then it is refused before any lookup", () => {
    const kb = new KnowledgeBase()
    expect(() => kb.get("../../etc/passwd")).toThrow(/invalid kb id/)
    expect(() => kb.get("kb1")).toThrow(KnowledgeBaseError)
  })

  test("#given entries #when filtered by tag #then only tagged entries come back", () => {
    const kb = new KnowledgeBase()
    kb.add({ title: "a", description: "d", tags: ["web"] })
    kb.add({ title: "b", description: "d", tags: ["recon"] })

    expect(kb.byTag("web").map((e) => e.title)).toEqual(["a"])
  })

  test("#given a blank command #when added #then it is dropped rather than stored", () => {
    const kb = new KnowledgeBase()
    const entry = kb.add({ title: "t", description: "d", commands: ["  ", "nmap -sV target"] })

    expect(entry.commands).toEqual(["nmap -sV target"])
  })
})

describe("kb search", () => {
  test("#given a matching title #when searched #then the entry is returned with a score", () => {
    const kb = new KnowledgeBase()
    kb.add({ title: "thinkphp rce", description: "framework exploit" })

    const hits = kb.search("thinkphp")
    expect(hits).toHaveLength(1)
    expect(hits[0]?.score).toBeGreaterThan(0)
  })

  test("#given a title match and a description-only match #when searched #then the title match ranks first", () => {
    const kb = new KnowledgeBase()
    kb.add({ title: "other technique", description: "mentions thinkphp once" })
    kb.add({ title: "thinkphp rce", description: "unrelated prose" })

    const hits = kb.search("thinkphp")
    expect(hits[0]?.entry.title).toBe("thinkphp rce")
  })

  test("#given no overlap #when searched #then nothing is returned", () => {
    const kb = new KnowledgeBase()
    kb.add({ title: "web path traversal", description: "d" })

    expect(kb.search("kerberos delegation")).toEqual([])
  })

  test("#given an empty query #when searched #then nothing is returned rather than everything", () => {
    const kb = new KnowledgeBase()
    kb.add({ title: "a", description: "d" })

    expect(kb.search("   ")).toEqual([])
  })

  test("#given a tag filter #when searched #then off-tag entries never appear even on a strong match", () => {
    const kb = new KnowledgeBase()
    kb.add({ title: "nmap scan", description: "recon", tags: ["recon"] })
    kb.add({ title: "nmap in a web context", description: "web", tags: ["web"] })

    const hits = kb.search("nmap", { tag: "web" })
    expect(hits.map((h) => h.entry.tags[0])).toEqual(["web"])
  })

  test("#given a limit #when searched #then at most that many hits return", () => {
    const kb = new KnowledgeBase()
    for (let i = 0; i < 5; i += 1) kb.add({ title: `nmap variant ${i}`, description: "scan" })

    expect(kb.search("nmap", { limit: 2 })).toHaveLength(2)
  })

  test("#given matching tags and matching detail #when searched #then both contribute to the score", () => {
    const kb = new KnowledgeBase()
    const entry = kb.add({
      title: "unrelated",
      description: "prose",
      detail: "kerberoast explained",
      tags: ["kerberoast"],
    })

    expect(kb.search("kerberoast")[0]?.entry.id).toBe(entry.id)
  })

  test("#given commands containing the term #when searched #then a command match still scores", () => {
    const kb = new KnowledgeBase()
    const entry = kb.add({ title: "generic", description: "prose", commands: ["sqlmap -u target"] })

    expect(kb.search("sqlmap")[0]?.entry.id).toBe(entry.id)
  })
})

describe("kb markdown import", () => {
  const doc = [
    "# PHP filter chain RCE",
    "",
    "Chains php filters into arbitrary file read and RCE.",
    "Tags: web, rce",
    "",
    "```bash",
    "python3 php_filter_chain_generator.py --chain 'id'",
    "```",
  ].join("\n")

  test("#given a markdown doc #when imported #then heading, paragraph and tags become the entry", () => {
    const kb = new KnowledgeBase()
    const entry = kb.importMarkdown(doc)

    expect(entry.title).toBe("PHP filter chain RCE")
    expect(entry.description).toContain("Chains php filters")
    expect(entry.tags).toEqual(["web", "rce"])
  })

  test("#given a fenced block #when imported #then its body becomes a command", () => {
    const kb = new KnowledgeBase()
    const entry = kb.importMarkdown(doc)

    expect(entry.commands[0]).toContain("php_filter_chain_generator")
  })

  test("#given no heading #when imported #then it is refused", () => {
    const kb = new KnowledgeBase()
    expect(() => kb.importMarkdown("just prose, no heading")).toThrow(/needs a heading/)
  })

  test("#given a heading but no paragraph #when imported #then it is refused", () => {
    const kb = new KnowledgeBase()
    expect(() => kb.importMarkdown("# Only a title")).toThrow(/needs a paragraph/)
  })

  test("#given explicit tags #when imported #then they merge with inline tags", () => {
    const kb = new KnowledgeBase()
    const entry = kb.importMarkdown(doc, { tags: ["ctf"], source: "internal-wiki" })

    expect(entry.tags).toContain("ctf")
    expect(entry.tags).toContain("web")
    expect(entry.source).toBe("internal-wiki")
  })

  test("#given a malformed inline tag #when imported #then it is dropped, not fatal", () => {
    const kb = new KnowledgeBase()
    const entry = kb.importMarkdown("# T\n\nbody prose\nTags: good, BAD TAG WITH SPACES\n")

    expect(entry.tags).toContain("good")
    expect(entry.tags.some((tag) => tag.includes(" "))).toBe(false)
  })
})
