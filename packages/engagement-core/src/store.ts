import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  EngagementGraph,
  GraphError,
  normalizeFactData,
  normalizeFactKind,
  type AddFactInput,
  type AddIntentInput,
  type FactKind,
  type FactRecord,
  type FlagRecord,
  type IntentRecord,
} from "./index"

// Matches sapper's node id contract. Bounded so an id can never carry a path
// separator or traversal segment into a filename.
const NODE_ID_RE = /^[a-z][a-z0-9_-]{0,16}$/

export interface StoreOptions {
  readonly root: string
}

interface ProjectFile {
  id: "proj"
  origin: string
  goal: string
  status: "active" | "complete"
  createdAt: string
  counters: { fact: number; intent: number; hint: number }
}

interface FactFile {
  id: string
  kind: FactKind | null
  title: string
  description?: string
  doc?: string | null
  data?: Record<string, string> | null
  createdAt: string
}

interface IntentFile {
  id: string
  title: string
  from: string[]
  to: string | null
  status: "open" | "claimed" | "done"
  claimedBy: string | null
  toGoal: boolean
  createdAt: string
}

export interface Snapshot {
  readonly goal: string
  readonly status: "active" | "complete"
  readonly facts: readonly FactRecord[]
  readonly intents: readonly IntentRecord[]
  readonly flags: readonly FlagRecord[]
}

/**
 * One JSON file per node under `.omc/engagement/`, so the graph is diffable and
 * survives a process death without a database. Ids are validated before they
 * touch the filesystem.
 */
export class EngagementStore {
  readonly root: string
  private readonly factsDir: string
  private readonly intentsDir: string
  private readonly projectPath: string

  constructor(options: StoreOptions) {
    this.root = options.root
    this.factsDir = join(this.root, "facts")
    this.intentsDir = join(this.root, "intents")
    this.projectPath = join(this.root, "project.json")
  }

  private assertSafeId(id: string): void {
    if (!NODE_ID_RE.test(id)) {
      throw new GraphError(`unsafe node id ${JSON.stringify(id)}; expected ${NODE_ID_RE}`)
    }
  }

  init(goal: string, origin = "omc"): void {
    if (!goal.trim()) throw new GraphError("an engagement needs a goal")
    mkdirSync(this.factsDir, { recursive: true })
    mkdirSync(this.intentsDir, { recursive: true })
    const project: ProjectFile = {
      id: "proj",
      origin,
      goal: goal.trim(),
      status: "active",
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      counters: { fact: 0, intent: 0, hint: 0 },
    }
    writeFileSync(this.projectPath, JSON.stringify(project, null, 2) + "\n", "utf-8")
  }

  private readProject(): ProjectFile {
    try {
      return JSON.parse(readFileSync(this.projectPath, "utf-8")) as ProjectFile
    } catch {
      throw new GraphError(`no engagement at ${this.root}; run init first`)
    }
  }

  private writeJson(path: string, value: unknown): void {
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf-8")
    renameSync(tmp, path)
  }

  /**
   * Allocates the next id, skipping any already occupied so a stale or
   * hand-edited counter cannot overwrite an existing node.
   */
  private nextId(prefix: "f" | "i"): string {
    const project = this.readProject()
    const key = prefix === "f" ? "fact" : "intent"
    const dir = prefix === "f" ? this.factsDir : this.intentsDir
    const occupied = new Set(readdirSync(dir).map((name) => name.replace(/\.json$/, "")))

    let n = project.counters[key]
    let id = `${prefix}${String(n).padStart(3, "0")}`
    while (occupied.has(id)) {
      n += 1
      id = `${prefix}${String(n).padStart(3, "0")}`
    }

    project.counters[key] = n + 1
    this.writeJson(this.projectPath, project)
    return id
  }

  addFact(input: AddFactInput): string {
    if (!input.title.trim()) throw new GraphError("a fact needs a title")
    const id = this.nextId("f")
    const file: FactFile = {
      id,
      kind: normalizeFactKind(input.kind ?? null),
      title: input.title.trim(),
      doc: input.doc?.trim() || null,
      data: normalizeFactData(input.data ?? null),
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    }
    this.writeJson(join(this.factsDir, `${id}.json`), file)
    return id
  }

  addIntent(input: AddIntentInput): string {
    if (!input.title.trim()) throw new GraphError("an intent needs a title")
    for (const dep of input.from) {
      this.assertSafeId(dep)
      if (!this.getFact(dep)) throw new GraphError(`intent depends on unknown fact ${dep}`)
    }
    const id = this.nextId("i")
    const file: IntentFile = {
      id,
      title: input.title.trim(),
      from: [...input.from],
      to: null,
      status: "open",
      claimedBy: null,
      toGoal: input.toGoal === true,
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    }
    this.writeJson(join(this.intentsDir, `${id}.json`), file)
    return id
  }

  getFact(id: string): FactRecord | null {
    this.assertSafeId(id)
    try {
      const raw = JSON.parse(readFileSync(join(this.factsDir, `${id}.json`), "utf-8")) as FactFile
      return {
        id: raw.id,
        kind: raw.kind,
        title: raw.title,
        doc: raw.doc ?? null,
        data: raw.data ?? null,
        settled: true,
        createdAt: raw.createdAt,
      }
    } catch {
      return null
    }
  }

  getIntent(id: string): IntentRecord | null {
    this.assertSafeId(id)
    try {
      const raw = JSON.parse(readFileSync(join(this.intentsDir, `${id}.json`), "utf-8")) as IntentFile
      return {
        id: raw.id,
        title: raw.title,
        from: raw.from,
        to: raw.to,
        toGoal: raw.toGoal,
        claimedBy: raw.claimedBy,
        createdAt: raw.createdAt,
      }
    } catch {
      return null
    }
  }

  facts(): FactRecord[] {
    return readdirSync(this.factsDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => this.getFact(name.replace(/\.json$/, "")))
      .filter((fact): fact is FactRecord => fact !== null)
  }

  intents(): IntentRecord[] {
    return readdirSync(this.intentsDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => this.getIntent(name.replace(/\.json$/, "")))
      .filter((intent): intent is IntentRecord => intent !== null)
  }

  /** Rehydrates an in-memory graph from the on-disk nodes. */
  load(): EngagementGraph {
    const graph = new EngagementGraph({ storeDir: this.root })
    const diskIdToGraphId = new Map<string, string>()

    for (const fact of this.facts()) {
      const graphId = graph.addFact({
        kind: fact.kind,
        title: fact.title,
        doc: fact.doc,
        data: fact.data,
      })
      diskIdToGraphId.set(fact.id, graphId)
    }

    for (const intent of this.intents()) {
      const mapped = intent.from
        .map((dep) => diskIdToGraphId.get(dep))
        .filter((dep): dep is string => dep !== undefined)
      if (mapped.length !== intent.from.length) continue
      graph.addIntent({ title: intent.title, from: mapped, toGoal: intent.toGoal })
    }

    return graph
  }

  snapshot(): Snapshot {
    const project = this.readProject()
    return {
      goal: project.goal,
      status: project.status,
      facts: this.facts(),
      intents: this.intents(),
      flags: [],
    }
  }

  destroy(): void {
    rmSync(this.root, { recursive: true, force: true })
  }
}
