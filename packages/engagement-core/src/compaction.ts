/**
 * Context-window compaction over a structured transcript AST.
 *
 * The transcript is parsed into sections (a system+human header followed by
 * body pairs of an assistant message plus its tool results), and compaction
 * decisions are made on node sizes and types rather than on raw strings. That
 * is what lets a long engagement stay inside a model window without cutting a
 * tool call away from its result.
 *
 * Absorbed from pentagi (MIT, pin cffed9485a) `backend/pkg/cast/chain_ast.go`
 * (`ChainAST`, `BodyPair`, `CalculateMessageSize`, `NormalizeToolCallIDs`,
 * `ClearReasoning`) and `backend/pkg/csum/chain_summary.go` (`SummarizeChain`,
 * `summarizeSections`, `summarizeLastSection`, `summarizeOversizedBodyPairs`).
 * See NOTICE.
 */

export const SUMMARIZED_MARKER = "**summarized content:**"

export interface ChainMessage {
  readonly role: "system" | "user" | "assistant" | "tool"
  readonly content: string
  readonly toolCallId?: string
  readonly toolName?: string
  readonly reasoning?: string
  readonly toolCalls?: readonly { readonly id: string; readonly name: string; readonly args: string }[]
  readonly summarized?: boolean
}

export interface BodyPair {
  readonly assistant: ChainMessage
  readonly toolResults: readonly ChainMessage[]
}

export interface ChainSection {
  readonly header: readonly ChainMessage[]
  readonly pairs: readonly BodyPair[]
}

export interface ChainAst {
  readonly sections: readonly ChainSection[]
}

export interface CompactionLimits {
  readonly maxBytes: number
  readonly maxPairBytes: number
  readonly keepSections: number
  readonly keepPairs: number
  readonly maxQaBytes: number
}

export const DEFAULT_COMPACTION_LIMITS: CompactionLimits = {
  maxBytes: 512 * 1024,
  maxPairBytes: 16 * 1024,
  keepSections: 2,
  keepPairs: 4,
  maxQaBytes: 64 * 1024,
}

export function messageSize(message: ChainMessage): number {
  let size = message.content.length
  if (message.reasoning) size += message.reasoning.length
  for (const call of message.toolCalls ?? []) size += call.name.length + call.args.length
  return size
}

export function pairSize(pair: BodyPair): number {
  return (
    messageSize(pair.assistant) +
    pair.toolResults.reduce((total, result) => total + messageSize(result), 0)
  )
}

export function sectionSize(section: ChainSection): number {
  const header = section.header.reduce((total, m) => total + messageSize(m), 0)
  return header + section.pairs.reduce((total, pair) => total + pairSize(pair), 0)
}

export function chainSize(ast: ChainAst): number {
  return ast.sections.reduce((total, section) => total + sectionSize(section), 0)
}

/**
 * Splits a flat transcript into sections. A user message that is not a tool
 * result opens a new section; each assistant message opens a body pair, and the
 * tool messages after it attach to that pair.
 */
export function buildChainAst(messages: readonly ChainMessage[]): ChainAst {
  const sections: { header: ChainMessage[]; pairs: BodyPair[] }[] = []
  let current: { header: ChainMessage[]; pairs: BodyPair[] } | undefined
  let openPair: { assistant: ChainMessage; toolResults: ChainMessage[] } | undefined

  const openSection = (): { header: ChainMessage[]; pairs: BodyPair[] } => {
    current = { header: [], pairs: [] }
    sections.push(current)
    return current
  }

  for (const message of messages) {
    if (message.role === "system") {
      const section = current ?? openSection()
      section.header.push(message)
      openPair = undefined
      continue
    }

    if (message.role === "user") {
      const section = current
      if (section !== undefined && openPair) {
        section.pairs.push({ assistant: openPair.assistant, toolResults: openPair.toolResults })
        openPair = undefined
      }
      const startsNewSection = section === undefined || section.pairs.length > 0
      const target = startsNewSection ? openSection() : section
      target.header.push(message)
      continue
    }

    if (message.role === "assistant") {
      const section = current ?? openSection()
      if (openPair) section.pairs.push({ assistant: openPair.assistant, toolResults: openPair.toolResults })
      openPair = { assistant: message, toolResults: [] }
      continue
    }

    if (message.role === "tool") {
      if (!openPair) {
        const section = current ?? openSection()
        openPair = {
          assistant: { role: "assistant", content: "", toolCalls: [] },
          toolResults: [],
        }
        void section
      }
      openPair.toolResults.push(message)
    }
  }

  if (openPair && current) {
    const section = current as { header: ChainMessage[]; pairs: BodyPair[] }
    section.pairs.push({ assistant: openPair.assistant, toolResults: openPair.toolResults })
  }

  if (sections.length === 0) sections.push({ header: [], pairs: [] })
  return { sections }
}

/** Strips reasoning blocks so a reused or summarized message carries no stale thinking. */
export function clearReasoning(messages: readonly ChainMessage[]): ChainMessage[] {
  return messages.map((message) => {
    if (message.reasoning === undefined) return message
    const { reasoning: _drop, ...rest } = message
    void _drop
    return rest
  })
}

/**
 * Rewrites provider tool-call ids to one pattern so the ids stay consistent
 * after a section is summarized and its original calls are gone.
 */
export function normalizeToolCallIds(
  messages: readonly ChainMessage[],
  pattern: (index: number) => string,
): ChainMessage[] {
  let index = 0
  const mapped = new Map<string, string>()

  return messages.map((message) => {
    if (!message.toolCalls?.length) {
      if (message.role === "tool" && message.toolCallId !== undefined) {
        const replacement = mapped.get(message.toolCallId)
        if (replacement !== undefined) return { ...message, toolCallId: replacement }
      }
      return message
    }

    const calls = message.toolCalls.map((call) => {
      const existing = mapped.get(call.id)
      if (existing !== undefined) return { ...call, id: existing }
      const next = pattern(index)
      index += 1
      mapped.set(call.id, next)
      return { ...call, id: next }
    })
    return { ...message, toolCalls: calls }
  })
}

function summarizePair(pair: BodyPair): BodyPair {
  const tools = pair.toolResults.map((result) => result.toolName ?? "tool").join(", ")
  const summary = [
    SUMMARIZED_MARKER,
    `assistant called ${pair.assistant.toolCalls?.length ?? 0} tool(s)${tools ? ` (${tools})` : ""}`,
    `results: ${pair.toolResults.length}`,
  ].join(" ")

  return {
    assistant: {
      role: "assistant",
      content: summary,
      toolCalls: [],
      summarized: true,
    },
    toolResults: [],
  }
}

function summarizeSection(section: ChainSection): ChainSection {
  const total = section.pairs.reduce((sum, pair) => sum + pairSize(pair), 0)
  return {
    header: [
      {
        role: "system",
        content: `${SUMMARIZED_MARKER} ${section.pairs.length} exchange(s), ${total} bytes compacted`,
        summarized: true,
      },
    ],
    pairs: [],
  }
}

export interface CompactionResult {
  readonly ast: ChainAst
  readonly summarizedSections: number
  readonly summarizedPairs: number
  readonly beforeBytes: number
  readonly afterBytes: number
}

/**
 * Compacts a chain: sections older than the keep window collapse into one
 * summary, oversized pairs inside the window are summarized in place, and the
 * most recent pairs are preserved verbatim so the live task keeps its context.
 */
export function compactChain(
  ast: ChainAst,
  limits: CompactionLimits = DEFAULT_COMPACTION_LIMITS,
): CompactionResult {
  const beforeBytes = chainSize(ast)
  const keepFrom = Math.max(0, ast.sections.length - limits.keepSections)

  let summarizedSections = 0
  let summarizedPairs = 0

  const sections = ast.sections.map((section, index) => {
    if (index < keepFrom) {
      if (section.pairs.length === 0 && section.header.every((m) => m.summarized)) return section
      summarizedSections += 1
      return summarizeSection(section)
    }

    const keepPairsFrom = Math.max(0, section.pairs.length - limits.keepPairs)
    const pairs = section.pairs.map((pair, pairIndex) => {
      if (pairIndex < keepPairsFrom) {
        summarizedPairs += 1
        return summarizePair(pair)
      }
      if (pairSize(pair) > limits.maxPairBytes) {
        summarizedPairs += 1
        return summarizePair(pair)
      }
      return pair
    })

    return { header: section.header, pairs }
  })

  const compacted: ChainAst = { sections }
  return {
    ast: compacted,
    summarizedSections,
    summarizedPairs,
    beforeBytes,
    afterBytes: chainSize(compacted),
  }
}

export function flattenChain(ast: ChainAst): ChainMessage[] {
  const out: ChainMessage[] = []
  for (const section of ast.sections) {
    out.push(...section.header)
    for (const pair of section.pairs) {
      out.push(pair.assistant, ...pair.toolResults)
    }
  }
  return out
}
