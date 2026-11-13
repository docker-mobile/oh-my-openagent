/**
 * Offline technique knowledge base. Entries are addressed by a stable id and
 * found by token overlap, so an operator can ask "how do I attack this" without
 * network access.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `lib/kb.py` (`KnowledgeBase`,
 * `add`, `get`, `search`, `import_markdown`). The 56 shipped entries are NOT
 * copied - see PARITY.md. See NOTICE.
 */

export class KnowledgeBaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "KnowledgeBaseError"
  }
}

const ID_RE = /^kb\d{3,}$/
const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/

export interface KbEntry {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly detail: string | null
  readonly commands: readonly string[]
  readonly tags: readonly string[]
  readonly source: string | null
  readonly createdAt: string
}

export interface KbEntryInput {
  readonly title: string
  readonly description: string
  readonly detail?: string | null
  readonly commands?: readonly string[]
  readonly tags?: readonly string[]
  readonly source?: string | null
}

export interface KbSearchHit {
  readonly entry: KbEntry
  readonly score: number
}

// Title matches matter more than body prose, so a technique the operator named
// outranks one that merely mentions the word.
const TITLE_WEIGHT = 2

function normalizeTags(tags: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const tag of tags ?? []) {
    const canonical = tag.trim().toLowerCase()
    if (!canonical) continue
    if (!TAG_RE.test(canonical)) {
      throw new KnowledgeBaseError(`invalid tag ${JSON.stringify(tag)}; expected ${TAG_RE}`)
    }
    if (!out.includes(canonical)) out.push(canonical)
  }
  return out
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .filter((token) => token.length > 0)
}

export class KnowledgeBase {
  private readonly entries = new Map<string, KbEntry>()
  private counter = 0

  private nextId(): string {
    this.counter += 1
    return `kb${String(this.counter).padStart(3, "0")}`
  }

  add(input: KbEntryInput): KbEntry {
    if (!input.title.trim()) throw new KnowledgeBaseError("a kb entry needs a title")
    if (!input.description.trim()) throw new KnowledgeBaseError("a kb entry needs a description")

    let id = this.nextId()
    while (this.entries.has(id)) {
      this.counter += 1
      id = `kb${String(this.counter).padStart(3, "0")}`
    }

    const entry: KbEntry = {
      id,
      title: input.title.trim(),
      description: input.description.trim(),
      detail: input.detail?.trim() || null,
      commands: [...(input.commands ?? [])].map((command) => command.trim()).filter(Boolean),
      tags: normalizeTags(input.tags),
      source: input.source?.trim() || null,
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    }

    this.entries.set(id, entry)
    return entry
  }

  get(id: string): KbEntry | undefined {
    if (!ID_RE.test(id)) throw new KnowledgeBaseError(`invalid kb id ${JSON.stringify(id)}`)
    return this.entries.get(id)
  }

  all(): readonly KbEntry[] {
    return [...this.entries.values()]
  }

  byTag(tag: string): readonly KbEntry[] {
    const canonical = tag.trim().toLowerCase()
    return [...this.entries.values()].filter((entry) => entry.tags.includes(canonical))
  }

  /**
   * Ranks entries by token overlap. A tag filter narrows the candidate set
   * before scoring, so a filtered search never returns an off-tag entry.
   */
  search(query: string, options: { readonly tag?: string; readonly limit?: number } = {}): KbSearchHit[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const candidates =
      options.tag !== undefined && options.tag.trim() !== ""
        ? this.byTag(options.tag)
        : [...this.entries.values()]

    const hits: KbSearchHit[] = []
    for (const entry of candidates) {
      const titleTokens = new Set(tokenize(entry.title))
      const descriptionTokens = new Set(tokenize(entry.description))
      const tagTokens = new Set(entry.tags.flatMap((tag) => tokenize(tag)))
      const detailTokens = new Set(tokenize(entry.detail ?? ""))
      const commandTokens = new Set(tokenize(entry.commands.join(" ")))

      let score = 0
      for (const token of queryTokens) {
        if (titleTokens.has(token)) score += TITLE_WEIGHT
        if (descriptionTokens.has(token)) score += 1
        if (tagTokens.has(token)) score += 1
        if (detailTokens.has(token)) score += 1
        if (commandTokens.has(token)) score += 1
      }

      if (score > 0) hits.push({ entry, score })
    }

    hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.entry.id.localeCompare(b.entry.id)))
    return options.limit !== undefined ? hits.slice(0, options.limit) : hits
  }

  /**
   * Converts a markdown document into an entry: the first heading is the title,
   * the first paragraph the description, fenced blocks the commands, and a
   * `Tags:` line the tags.
   */
  importMarkdown(markdown: string, options: { readonly tags?: readonly string[]; readonly source?: string | null } = {}): KbEntry {
    const lines = markdown.split("\n")

    const headingIndex = lines.findIndex((line) => /^#{1,6}\s+\S/.test(line))
    const title = headingIndex >= 0 ? (lines[headingIndex] as string).replace(/^#{1,6}\s+/, "").trim() : ""
    if (!title) throw new KnowledgeBaseError("markdown needs a heading to serve as the title")

    const body = lines.slice(headingIndex + 1)
    const paragraph = body.find((line) => line.trim() !== "" && !line.startsWith("#") && !line.startsWith("```"))
    if (!paragraph) throw new KnowledgeBaseError("markdown needs a paragraph to serve as the description")

    const commands: string[] = []
    let inFence = false
    let current: string[] = []
    for (const line of body) {
      if (line.trimStart().startsWith("```")) {
        if (inFence && current.length > 0) commands.push(current.join("\n"))
        current = []
        inFence = !inFence
        continue
      }
      if (inFence) current.push(line)
    }

    const inlineTags = body
      .filter((line) => /^\s*tags\s*:/i.test(line))
      .flatMap((line) => (line.split(":")[1] ?? "").split(","))
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => TAG_RE.test(tag))

    return this.add({
      title,
      description: paragraph.trim(),
      detail: body.join("\n").trim() || null,
      commands,
      tags: [...new Set([...(options.tags ?? []).map((t) => t.toLowerCase()), ...inlineTags])],
      source: options.source ?? null,
    })
  }
}
