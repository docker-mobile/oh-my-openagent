import { describe, expect, test } from "bun:test"

import {
  DEFAULT_COMPACTION_LIMITS,
  SUMMARIZED_MARKER,
  buildChainAst,
  chainSize,
  clearReasoning,
  compactChain,
  flattenChain,
  normalizeToolCallIds,
  pairSize,
  type ChainMessage,
} from "./compaction"

function assistant(content: string, toolCalls?: ChainMessage["toolCalls"]): ChainMessage {
  return { role: "assistant", content, ...(toolCalls ? { toolCalls } : {}) }
}

function toolResult(id: string, name: string, content: string): ChainMessage {
  return { role: "tool", content, toolCallId: id, toolName: name }
}

describe("chain ast", () => {
  test("#given a transcript #when parsed #then each user turn opens a section and each assistant a pair", () => {
    const ast = buildChainAst([
      { role: "system", content: "sys" },
      { role: "user", content: "scan the host" },
      assistant("ok", [{ id: "t1", name: "nmap", args: "{}" }]),
      toolResult("t1", "nmap", "80/tcp open"),
    ])

    expect(ast.sections).toHaveLength(1)
    expect(ast.sections[0]?.header.map((m) => m.role)).toEqual(["system", "user"])
    expect(ast.sections[0]?.pairs).toHaveLength(1)
    expect(ast.sections[0]?.pairs[0]?.toolResults).toHaveLength(1)
  })

  test("#given tool results #when parsed #then they attach to the assistant pair that requested them", () => {
    const ast = buildChainAst([
      { role: "user", content: "go" },
      assistant("a", [{ id: "t1", name: "nmap", args: "{}" }]),
      toolResult("t1", "nmap", "out1"),
      toolResult("t2", "nuclei", "out2"),
    ])

    expect(ast.sections[0]?.pairs[0]?.toolResults.map((r) => r.toolName)).toEqual(["nmap", "nuclei"])
  })

  test("#given several user turns #when parsed #then each becomes its own section", () => {
    const ast = buildChainAst([
      { role: "user", content: "one" },
      assistant("a"),
      { role: "user", content: "two" },
      assistant("b"),
    ])

    expect(ast.sections).toHaveLength(2)
  })

  test("#given an empty transcript #when parsed #then one empty section is returned rather than nothing", () => {
    expect(buildChainAst([]).sections).toHaveLength(1)
  })

  test("#given an ast #when flattened #then the original message order is restored", () => {
    const messages: ChainMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
      assistant("a"),
      toolResult("t1", "nmap", "out"),
    ]

    expect(flattenChain(buildChainAst(messages))).toEqual(messages)
  })
})

describe("size accounting", () => {
  test("#given a message with reasoning and tool calls #when sized #then all parts count", () => {
    const ast = buildChainAst([
      { role: "assistant", content: "x".repeat(10), reasoning: "y".repeat(5), toolCalls: [{ id: "i", name: "nm", args: "{}" }] },
    ])

    const pair = ast.sections[0]?.pairs[0]
    if (pair === undefined) throw new Error("expected a body pair")
    expect(pairSize(pair)).toBe(10 + 5 + 2 + 2)
  })

  test("#given tool results #when the pair is sized #then the results count", () => {
    const ast = buildChainAst([
      { role: "user", content: "go" },
      assistant("a"),
      toolResult("t1", "nmap", "z".repeat(100)),
    ])

    const pair = ast.sections[0]?.pairs[0]
    if (pair === undefined) throw new Error("expected a body pair")
    expect(pairSize(pair)).toBeGreaterThanOrEqual(101)
  })

  test("#given a chain #when sized #then it totals its sections", () => {
    const ast = buildChainAst([{ role: "user", content: "abcd" }])
    expect(chainSize(ast)).toBe(4)
  })
})

describe("reasoning and tool-call id normalization", () => {
  test("#given messages with reasoning #when cleared #then the reasoning is dropped and content kept", () => {
    const cleared = clearReasoning([{ role: "assistant", content: "keep", reasoning: "drop" }])

    expect(cleared[0]?.content).toBe("keep")
    expect(cleared[0]?.reasoning).toBeUndefined()
  })

  test("#given a message without reasoning #when cleared #then it is returned untouched", () => {
    const original: ChainMessage = { role: "assistant", content: "keep" }
    expect(clearReasoning([original])[0]).toEqual(original)
  })

  test("#given provider ids #when normalized #then calls and their results share the new id", () => {
    const normalized = normalizeToolCallIds(
      [
        assistant("a", [{ id: "toolu_abc", name: "nmap", args: "{}" }]),
        toolResult("toolu_abc", "nmap", "out"),
      ],
      (i) => `call_${i}`,
    )

    expect(normalized[0]?.toolCalls?.[0]?.id).toBe("call_0")
    expect(normalized[1]?.toolCallId).toBe("call_0")
  })

  test("#given two result messages for one call #when normalized #then both point at the same new id", () => {
    const normalized = normalizeToolCallIds(
      [
        assistant("a", [{ id: "x", name: "n", args: "{}" }]),
        toolResult("x", "n", "one"),
        toolResult("x", "n", "two"),
      ],
      (i) => `c${i}`,
    )

    expect(normalized[1]?.toolCallId).toBe("c0")
    expect(normalized[2]?.toolCallId).toBe("c0")
  })
})

describe("compaction", () => {
  const bigChain = (sections: number, pairsPer: number, bodySize: number): ChainMessage[] => {
    const out: ChainMessage[] = []
    for (let s = 0; s < sections; s += 1) {
      out.push({ role: "user", content: `task ${s}` })
      for (let p = 0; p < pairsPer; p += 1) {
        out.push(assistant("thinking", [{ id: `c${s}-${p}`, name: "nmap", args: "{}" }]))
        out.push(toolResult(`c${s}-${p}`, "nmap", "r".repeat(bodySize)))
      }
    }
    return out
  }

  test("#given a chain inside the budget #when compacted #then nothing is summarized", () => {
    const ast = buildChainAst([{ role: "user", content: "small" }, assistant("ok")])
    const result = compactChain(ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 5, keepPairs: 5 })

    expect(result.summarizedSections).toBe(0)
    expect(result.summarizedPairs).toBe(0)
  })

  test("#given more sections than the keep window #when compacted #then older sections collapse to a marker", () => {
    const ast = buildChainAst(bigChain(5, 1, 10))
    const result = compactChain(ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 1, keepPairs: 5, maxPairBytes: 10_000 })

    expect(result.summarizedSections).toBe(4)
    expect(result.ast.sections[0]?.header[0]?.content).toContain(SUMMARIZED_MARKER)
    expect(result.ast.sections[0]?.pairs).toHaveLength(0)
  })

  test("#given an oversized pair inside the keep window #when compacted #then it is summarized in place", () => {
    const ast = buildChainAst([
      { role: "user", content: "go" },
      assistant("a", [{ id: "c1", name: "nmap", args: "{}" }]),
      toolResult("c1", "nmap", "x".repeat(5000)),
    ])
    const result = compactChain(ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 1, keepPairs: 5, maxPairBytes: 100 })

    expect(result.summarizedPairs).toBe(1)
    expect(result.ast.sections[0]?.pairs[0]?.assistant.content).toContain(SUMMARIZED_MARKER)
    expect(result.ast.sections[0]?.pairs[0]?.toolResults).toHaveLength(0)
  })

  test("#given compaction #when measured #then the chain shrinks", () => {
    const ast = buildChainAst(bigChain(6, 2, 3000))
    const result = compactChain(ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 1, keepPairs: 1, maxPairBytes: 500 })

    expect(result.afterBytes).toBeLessThan(result.beforeBytes)
    expect(result.beforeBytes).toBeGreaterThan(0)
  })

  test("#given the most recent pairs #when compacted #then they are preserved verbatim", () => {
    const ast = buildChainAst([
      { role: "user", content: "go" },
      assistant("first"),
      toolResult("c1", "nmap", "old"),
      assistant("second"),
      toolResult("c2", "nuclei", "new"),
    ])
    const result = compactChain(ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 5, keepPairs: 1, maxPairBytes: 10_000 })

    const pairs = result.ast.sections[0]?.pairs ?? []
    expect(pairs[pairs.length - 1]?.toolResults[0]?.content).toBe("new")
  })

  test("#given an already summarized section #when compacted again #then it is not re-summarized", () => {
    const ast = buildChainAst(bigChain(4, 1, 10))
    const once = compactChain(ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 1, keepPairs: 5 })
    const twice = compactChain(once.ast, { ...DEFAULT_COMPACTION_LIMITS, keepSections: 1, keepPairs: 5 })

    expect(twice.summarizedSections).toBe(0)
  })
})
