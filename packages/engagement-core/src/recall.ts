/**
 * Recall: surface prior facts and intents similar to a task at hand, so an
 * engagement does not repeat recon it already performed.
 *
 * Token overlap carries most of the weight; a fuzzy ratio fallback catches a
 * reworded task that shares few exact tokens, which is the case that matters
 * most when an operator rephrases work already done.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `_recall_tokenize`,
 * `_recall_score`, `recall`, `render_recall` and `render_history_block` in
 * `lib/sapper.py`. See NOTICE.
 */

import type { FactRecord, IntentRecord } from "./index"
import type { EngagementStore } from "./store"

const TITLE_WEIGHT = 2
const DOC_HEAD_CHARS = 500
const FUZZY_THRESHOLD = 0.45
const FUZZY_BONUS = 0.2

export interface RecallCandidate {
  readonly id: string
  readonly kind: "fact" | "intent"
  readonly title: string
  readonly description: string
  readonly doc: string | null
  readonly tags: readonly string[]
}

export interface RecallHit {
  readonly candidate: RecallCandidate
  readonly score: number
}

/**
 * Splits text into comparable tokens. CJK characters become single-character
 * tokens, which is what removes any need for a language-specific tokenizer.
 */
export function recallTokenize(text: string): string[] {
  const out: string[] = []
  let latin = ""

  const flush = (): void => {
    if (latin.length > 0) {
      out.push(latin.toLowerCase())
      latin = ""
    }
  }

  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      flush()
      out.push(char)
      continue
    }
    if (/[A-Za-z0-9]/.test(char)) {
      latin += char
      continue
    }
    flush()
  }
  flush()

  return out
}

/** Levenshtein-based ratio in the spirit of difflib's SequenceMatcher.quick_ratio. */
export function similarityRatio(a: string, b: string): number {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  if (left === right) return 1
  if (left.length === 0 || right.length === 0) return 0

  const previous = new Array<number>(right.length + 1)
  const current = new Array<number>(right.length + 1)
  for (let j = 0; j <= right.length; j += 1) previous[j] = j

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      const del = (previous[j] as number) + 1
      const ins = (current[j - 1] as number) + 1
      const sub = (previous[j - 1] as number) + cost
      current[j] = Math.min(del, ins, sub)
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j] as number
  }

  const distance = previous[right.length] as number
  return 1 - distance / Math.max(left.length, right.length)
}

export function recallScore(query: string, candidate: RecallCandidate): number {
  const queryTokens = recallTokenize(query)
  if (queryTokens.length === 0) return 0

  const titleTokens = new Set(recallTokenize(candidate.title))
  const descriptionTokens = new Set(recallTokenize(candidate.description))
  const tagTokens = new Set(candidate.tags.flatMap((tag) => recallTokenize(tag)))
  const docTokens = new Set(recallTokenize((candidate.doc ?? "").slice(0, DOC_HEAD_CHARS)))

  let score = 0
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += TITLE_WEIGHT
    if (descriptionTokens.has(token)) score += 1
    if (tagTokens.has(token)) score += 1
    if (docTokens.has(token)) score += 1
  }

  if (score === 0) {
    const ratio = similarityRatio(query, candidate.title)
    if (ratio >= FUZZY_THRESHOLD) return ratio + FUZZY_BONUS
  }

  return score
}

export function toCandidates(
  facts: readonly FactRecord[],
  intents: readonly IntentRecord[],
): RecallCandidate[] {
  const factCandidates = facts.map((fact) => ({
    id: fact.id,
    kind: "fact" as const,
    title: fact.title,
    description: fact.kind ? `${fact.kind} ${Object.entries(fact.data ?? {}).map(([k, v]) => `${k}=${v}`).join(" ")}` : "",
    doc: fact.doc,
    tags: fact.kind ? [fact.kind] : [],
  }))

  const intentCandidates = intents.map((intent) => ({
    id: intent.id,
    kind: "intent" as const,
    title: intent.title,
    description: intent.from.join(" "),
    doc: null,
    tags: [],
  }))

  return [...factCandidates, ...intentCandidates]
}

export interface RecallOptions {
  readonly limit?: number
  readonly minScore?: number
}

export function recall(
  query: string,
  candidates: readonly RecallCandidate[],
  options: RecallOptions = {},
): RecallHit[] {
  const minScore = options.minScore ?? 0.1

  const hits: RecallHit[] = []
  for (const candidate of candidates) {
    const score = recallScore(query, candidate)
    if (score >= minScore) hits.push({ candidate, score })
  }

  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.candidate.id.localeCompare(b.candidate.id)))
  return options.limit !== undefined ? hits.slice(0, options.limit) : hits
}

export function recallFromStore(query: string, store: EngagementStore, options?: RecallOptions): RecallHit[] {
  return recall(query, toCandidates(store.facts(), store.intents()), options)
}

export function renderRecall(hits: readonly RecallHit[]): string {
  if (hits.length === 0) return "(no prior work matches)"
  return hits
    .map((hit) => `${hit.candidate.id} [${hit.candidate.kind}] ${hit.candidate.title} (score ${hit.score.toFixed(2)})`)
    .join("\n")
}

export interface HistoryEntry {
  readonly id: string
  readonly title: string
}

export function renderHistoryBlock(entries: readonly HistoryEntry[]): string {
  if (entries.length === 0) return ""
  return ["Recent:", ...entries.map((entry) => `- ${entry.id} ${entry.title}`)].join("\n")
}
