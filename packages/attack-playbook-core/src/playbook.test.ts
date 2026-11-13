import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"

import { EXECUTOR_TYPES, TECHNIQUE_PLATFORMS, type Technique } from "./types"

// Resolved from this module, never from the process cwd: these tests must hold under
// `bun test` from the repository root, from a package directory, or from /tmp.
const DATA_DIR = join(import.meta.dir, "..", "data")
const CORPUS_PATH = join(DATA_DIR, "techniques.json")
const INDEX_PATH = join(DATA_DIR, "index.json")
const PIN_PATH = join(DATA_DIR, "playbook.pin.txt")

const TECHNIQUE_ID = /^T[0-9]{4}(\.[0-9]{3})?$/
const PIN_SHAPE = /^[0-9a-f]{40}$/
const COMMIT_DATE = /^\d{4}-\d{2}-\d{2}T/

interface Corpus {
  readonly techniques: readonly Technique[]
  readonly pin: string
  readonly generatedAt: string
}

function assertCorpus(value: unknown): Corpus {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${CORPUS_PATH} is not an object`)
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.techniques)) {
    throw new Error(`${CORPUS_PATH} has no techniques array`)
  }
  return {
    techniques: record.techniques as readonly Technique[],
    pin: String(record.pin),
    generatedAt: String(record.generatedAt),
  }
}

async function loadCorpus(): Promise<Corpus> {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(`${CORPUS_PATH} is missing. Run script/generate-playbook.mjs first.`)
  }
  return assertCorpus(await Bun.file(CORPUS_PATH).json())
}

const atomicsOf = (corpus: Corpus) => corpus.techniques.flatMap((technique) => technique.atomics)

describe("attack playbook corpus", () => {
  describe("#given the generated corpus file", () => {
    describe("#when it is loaded from disk", () => {
      test("#then it parses and holds techniques with a real atomic total", async () => {
        const corpus = await loadCorpus()
        const atomics = atomicsOf(corpus)
        console.log(`attack playbook corpus: ${corpus.techniques.length} techniques, ${atomics.length} atomics`)

        expect(corpus.techniques.length).toBeGreaterThan(300)
        expect(atomics.length).toBeGreaterThan(1000)
        for (const technique of corpus.techniques) {
          expect(technique.atomics.length).toBeGreaterThan(0)
        }
      })

      test("#then every technique id matches the ATT&CK id shape", async () => {
        const corpus = await loadCorpus()
        for (const technique of corpus.techniques) {
          expect(technique.id).toMatch(TECHNIQUE_ID)
          expect(technique.displayName.trim().length).toBeGreaterThan(0)
        }
      })

      test("#then every atomic index matches its position and every guid is unique", async () => {
        const corpus = await loadCorpus()
        const guids = new Set<string>()
        let total = 0

        for (const technique of corpus.techniques) {
          for (const [position, atomic] of technique.atomics.entries()) {
            expect(atomic.index).toBe(position)
            expect(atomic.technique).toBe(technique.id)
            expect(atomic.guid.trim().length).toBeGreaterThan(0)
            guids.add(atomic.guid)
            total += 1
          }
        }

        expect(guids.size).toBe(total)
        expect(total).toBe(atomicsOf(corpus).length)
      })
    })

    describe("#when its normalized fields are checked against the frozen unions", () => {
      test("#then every executor name is a member of ExecutorType", async () => {
        const corpus = await loadCorpus()
        const known = new Set<string>(EXECUTOR_TYPES)
        const unknown = new Set<string>()
        const seen = new Set<string>()

        for (const atomic of atomicsOf(corpus)) {
          seen.add(atomic.executor.name)
          if (!known.has(atomic.executor.name)) unknown.add(atomic.executor.name)
          expect(atomic.manual).toBe(atomic.executor.name === "manual")
        }

        expect([...unknown]).toEqual([])
        // command_prompt has no member in the union: the generator must have landed it
        // on `command`, which only holds while its normalisation stays in place.
        expect(seen.has("command")).toBe(true)
        expect(seen.has("command_prompt")).toBe(false)
      })

      test("#then every platform is a member of TechniquePlatform", async () => {
        const corpus = await loadCorpus()
        const known = new Set<string>(TECHNIQUE_PLATFORMS)
        const unknown = new Set<string>()

        for (const atomic of atomicsOf(corpus)) {
          expect(atomic.platforms.length).toBeGreaterThan(0)
          for (const platform of atomic.platforms) {
            if (!known.has(platform)) unknown.add(platform)
          }
        }

        expect([...unknown]).toEqual([])
      })

      test("#then a command executor carries a command and a manual one carries steps", async () => {
        const corpus = await loadCorpus()

        for (const atomic of atomicsOf(corpus)) {
          if (atomic.manual) {
            expect(atomic.executor.command).toBe("")
            expect(atomic.executor.steps.length).toBeGreaterThan(0)
            continue
          }
          expect(atomic.executor.command.trim().length).toBeGreaterThan(0)
        }
      })
    })

    describe("#when the input arguments and dependencies are inspected", () => {
      test("#then arguments and dependencies both survive the mapping", async () => {
        const corpus = await loadCorpus()
        const atomics = atomicsOf(corpus)

        const withArguments = atomics.filter((atomic) => Object.keys(atomic.arguments).length > 0)
        const withDependencies = atomics.filter((atomic) => atomic.dependencies.length > 0)

        expect(withArguments.length).toBeGreaterThan(0)
        expect(withDependencies.length).toBeGreaterThan(0)

        for (const atomic of withArguments) {
          for (const [key, argument] of Object.entries(atomic.arguments)) {
            expect(key.trim().length).toBeGreaterThan(0)
            expect(argument.description.trim().length).toBeGreaterThan(0)
            expect(typeof argument.default === "string" || argument.default === null).toBe(true)
          }
        }

        for (const atomic of withDependencies) {
          for (const dependency of atomic.dependencies) {
            expect(dependency.prereqCommand.trim().length).toBeGreaterThan(0)
          }
        }
      })
    })

    describe("#when the tactic mapping is read from the upstream index", () => {
      test("#then techniques carry tactics that the index anchors", async () => {
        const corpus = await loadCorpus()
        const withTactics = corpus.techniques.filter((technique) => technique.tactics.length > 0)

        expect(withTactics.length).toBeGreaterThan(0)

        for (const technique of withTactics) {
          expect([...technique.tactics]).toEqual([...new Set(technique.tactics)].sort())
          for (const tactic of technique.tactics) {
            expect(tactic).toMatch(/^[a-z][a-z-]*$/)
          }
        }

        const credentialDump = corpus.techniques.find((technique) => technique.id === "T1003.001")
        expect(credentialDump?.tactics).toContain("credential-access")
      })
    })

    describe("#when the pin and the index envelope are compared with the corpus", () => {
      test("#then the pin file names the pinned commit as one line", async () => {
        const corpus = await loadCorpus()
        const pin = (await Bun.file(PIN_PATH).text()).trim()

        expect(pin).toMatch(PIN_SHAPE)
        expect(corpus.pin).toBe(pin)
        expect(corpus.generatedAt).toMatch(COMMIT_DATE)
      })

      test("#then the index counts agree with the corpus it indexes", async () => {
        const corpus = await loadCorpus()
        const index = (await Bun.file(INDEX_PATH).json()) as {
          techniques: number
          atomics: number
          pin: string
        }

        expect(index.techniques).toBe(corpus.techniques.length)
        expect(index.atomics).toBe(atomicsOf(corpus).length)
        expect(index.pin).toBe(corpus.pin)
      })
    })
  })

  describe("#given a working directory outside the repository", () => {
    describe("#when the corpus path is resolved", () => {
      test("#then it is module-relative and still finds the corpus", async () => {
        const original = process.cwd()
        expect(isAbsolute(CORPUS_PATH)).toBe(true)

        // The cwd is displaced only for this synchronous block: it is process-global,
        // so holding it across an await would leak into concurrently running tests.
        let foundWhileOutside = false
        process.chdir(tmpdir())
        try {
          foundWhileOutside = existsSync(CORPUS_PATH)
          expect(existsSync(join(process.cwd(), "data", "techniques.json"))).toBe(false)
        } finally {
          process.chdir(original)
        }

        expect(process.cwd()).toBe(original)
        expect(foundWhileOutside).toBe(true)
        const corpus = await loadCorpus()
        expect(corpus.techniques.length).toBeGreaterThan(300)
        expect(atomicsOf(corpus).length).toBeGreaterThan(1000)
      })
    })
  })
})
