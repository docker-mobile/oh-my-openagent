/**
 * Engagement fact graph - the offensive working memory for oh-my-cybersecurity.
 *
 * Facts are confirmed observations (nodes). Intents are units of attack work
 * (edges) that consume facts and produce a new fact when concluded, so state
 * lives in the graph rather than in any one process.
 *
 * Absorbed from sapper-v2 (MIT, Copyright (c) N1nEmAn, pin 7b75e6f1f5)
 * `lib/sapper.py` and its offensive doctrine templates. See NOTICE.
 */

export const FACT_KINDS = [
  "host",
  "service",
  "cred",
  "vuln",
  "loot",
  "flag",
  "note",
] as const

export type FactKind = (typeof FACT_KINDS)[number]

export const FACT_DATA_KEYS: Readonly<Record<FactKind, readonly string[]>> = {
  host: ["ip", "os", "status"],
  service: ["host", "port", "proto", "product", "version", "url"],
  vuln: ["host", "port", "cve", "name", "severity", "status"],
  cred: ["username", "password", "host", "service", "source"],
  loot: ["path", "hash", "key", "note"],
  flag: ["challenge", "value"],
  note: ["note"],
}

// Bounded so a key can never inject a path separator, shell metacharacter or
// newline into a node file or a rendered report.
const DATA_KEY_RE = /^[A-Za-z0-9_.-]+$/

const FACT_ID_PREFIX = "f-"
const INTENT_ID_PREFIX = "i-"

export class GraphError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GraphError"
  }
}

export interface FactRecord {
  readonly id: string
  readonly kind: FactKind | null
  readonly title: string
  readonly doc: string | null
  readonly data: Readonly<Record<string, string>> | null
  readonly settled: boolean
  readonly createdAt: string
}

export interface IntentRecord {
  readonly id: string
  readonly title: string
  readonly from: readonly string[]
  readonly to: string | null
  readonly toGoal: boolean
  readonly claimedBy: string | null
  readonly createdAt: string
}

export interface FlagRecord {
  readonly value: string
  readonly challenge: string
  readonly status: "recorded" | "submitted" | "rejected"
  readonly submitted: boolean
}

export interface GraphSummary {
  readonly facts: ReadonlyArray<{ id: string; kind: FactKind | null; title: string }>
  readonly intents: ReadonlyArray<{ id: string; title: string; to: string | null }>
  readonly intel: Readonly<Record<FactKind, number>>
  readonly complete: boolean
}

export interface EngagementGraphOptions {
  readonly storeDir: string
}

export interface AddFactInput {
  readonly kind?: FactKind | string | null
  readonly title: string
  readonly doc?: string | null
  readonly data?: Record<string, unknown> | null
}

export interface AddIntentInput {
  readonly title: string
  readonly from: readonly string[]
  readonly toGoal?: boolean
}

export function normalizeFactKind(kind: string | null | undefined): FactKind | null {
  if (kind === null || kind === undefined) return null
  const canonical = kind.trim().toLowerCase()
  if (!canonical) return null
  if (!(FACT_KINDS as readonly string[]).includes(canonical)) {
    throw new GraphError(
      `unknown fact kind ${JSON.stringify(kind)}; expected one of: ${FACT_KINDS.join(", ")}`,
    )
  }
  return canonical as FactKind
}

export function normalizeFactData(
  data: Record<string, unknown> | null | undefined,
): Record<string, string> | null {
  if (data === null || data === undefined) return null
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new GraphError("fact data must be an object of key=value scalars")
  }

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!DATA_KEY_RE.test(key)) {
      throw new GraphError(`fact data key ${JSON.stringify(key)} must match [A-Za-z0-9_.-]+`)
    }
    if (value === null || value === undefined) continue
    if (typeof value === "object") {
      throw new GraphError(`fact data value for ${JSON.stringify(key)} must be a scalar`)
    }
    out[key] = String(value)
  }

  return Object.keys(out).length > 0 ? out : null
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

export class EngagementGraph {
  readonly storeDir: string
  private readonly facts = new Map<string, FactRecord>()
  private readonly intents = new Map<string, IntentRecord>()
  private readonly flagLedger: FlagRecord[] = []
  private counter = 0

  constructor(options: EngagementGraphOptions) {
    this.storeDir = options.storeDir
  }

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}${this.counter.toString(36).padStart(4, "0")}`
  }

  addFact(input: AddFactInput): string {
    if (!input.title.trim()) throw new GraphError("a fact needs a title")

    const id = this.nextId(FACT_ID_PREFIX)
    this.facts.set(id, {
      id,
      kind: normalizeFactKind(input.kind ?? null),
      title: input.title.trim(),
      doc: input.doc?.trim() || null,
      data: normalizeFactData(input.data ?? null),
      settled: true,
      createdAt: nowIso(),
    })
    return id
  }

  getFact(id: string): FactRecord | undefined {
    return this.facts.get(id)
  }

  allFacts(): FactRecord[] {
    return [...this.facts.values()]
  }

  allIntents(): IntentRecord[] {
    return [...this.intents.values()]
  }

  // A lead is often recorded before it is confirmed; until it settles, nothing
  // depending on it may be dispatched.
  releaseFact(id: string): void {
    const fact = this.facts.get(id)
    if (!fact) throw new GraphError(`unknown fact ${id}`)
    this.facts.set(id, { ...fact, settled: false })
  }

  addIntent(input: AddIntentInput): string {
    if (!input.title.trim()) throw new GraphError("an intent needs a title")
    for (const dependency of input.from) {
      if (!this.facts.has(dependency)) {
        throw new GraphError(`intent depends on unknown fact ${dependency}`)
      }
    }

    const id = this.nextId(INTENT_ID_PREFIX)
    this.intents.set(id, {
      id,
      title: input.title.trim(),
      from: [...input.from],
      to: null,
      toGoal: input.toGoal === true,
      claimedBy: null,
      createdAt: nowIso(),
    })
    return id
  }

  getIntent(id: string): IntentRecord | undefined {
    return this.intents.get(id)
  }

  frontier(): IntentRecord[] {
    return [...this.intents.values()].filter((intent) => {
      if (intent.to !== null || intent.claimedBy !== null) return false
      return intent.from.every((dependency) => this.facts.get(dependency)?.settled === true)
    })
  }

  claim(intentId: string, worker: string): boolean {
    const intent = this.intents.get(intentId)
    if (!intent) throw new GraphError(`unknown intent ${intentId}`)
    if (intent.claimedBy !== null) return false
    if (intent.to !== null) return false

    this.intents.set(intentId, { ...intent, claimedBy: worker })
    return true
  }

  release(intentId: string, worker: string): void {
    const intent = this.intents.get(intentId)
    if (!intent) throw new GraphError(`unknown intent ${intentId}`)
    if (intent.claimedBy !== worker) {
      throw new GraphError(`intent ${intentId} is claimed by ${intent.claimedBy ?? "nobody"}`)
    }
    this.intents.set(intentId, { ...intent, claimedBy: null })
  }

  done(intentId: string, produced: AddFactInput): string {
    const intent = this.intents.get(intentId)
    if (!intent) throw new GraphError(`unknown intent ${intentId}`)
    if (intent.to !== null) throw new GraphError(`intent ${intentId} is already concluded`)

    const producedId = this.addFact(produced)
    this.intents.set(intentId, { ...intent, to: producedId, claimedBy: null })
    return producedId
  }

  // The capture is persisted BEFORE submission is attempted, so a platform
  // failure can never lose a flag that was already in hand.
  recordFlag(value: string, challenge: string): { duplicate: boolean; record: FlagRecord } {
    const trimmed = value.trim()
    if (!trimmed) throw new GraphError("a flag needs a value")

    const existing = this.flagLedger.find(
      (flag) => flag.value === trimmed && flag.challenge === challenge,
    )
    if (existing) return { duplicate: true, record: existing }

    const record: FlagRecord = {
      value: trimmed,
      challenge,
      status: "recorded",
      submitted: false,
    }
    this.flagLedger.push(record)
    return { duplicate: false, record }
  }

  flags(): readonly FlagRecord[] {
    return [...this.flagLedger]
  }

  intel(): Record<FactKind, number> {
    const counts = Object.fromEntries(FACT_KINDS.map((kind) => [kind, 0])) as Record<FactKind, number>
    for (const fact of this.facts.values()) {
      if (!fact.kind) continue
      if (fact.kind === "flag") continue
      counts[fact.kind] += 1
    }
    return counts
  }

  isComplete(): boolean {
    const goals = [...this.intents.values()].filter((intent) => intent.toGoal)
    if (goals.length === 0) return false
    return goals.every((intent) => intent.to !== null)
  }

  // Deliberately excludes `data`: credential material and loot must never reach
  // a model context or a log through a status view.
  summary(): GraphSummary {
    return {
      facts: [...this.facts.values()].map((fact) => ({
        id: fact.id,
        kind: fact.kind,
        title: fact.title,
      })),
      intents: [...this.intents.values()].map((intent) => ({
        id: intent.id,
        title: intent.title,
        to: intent.to,
      })),
      intel: this.intel(),
      complete: this.isComplete(),
    }
  }
}
