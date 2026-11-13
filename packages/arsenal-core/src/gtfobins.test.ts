import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { OffensiveAction, OffensivePrimitive, PrimitiveCommand } from "./types"

const PACKAGE_DIR = join(import.meta.dir, "..")
const GENERATOR = join(PACKAGE_DIR, "script", "generate-gtfobins.mjs")
const OUTPUT_ROOT = process.env["OMC_ARSENAL_ROOT"] || join(PACKAGE_DIR, "data")
const CORPUS_PATH = join(OUTPUT_ROOT, "gtfobins.json")
const PIN_PATH = join(OUTPUT_ROOT, "gtfobins.pin.txt")

const BUILD_COMMAND =
  "git clone --depth 1 https://github.com/GTFOBins/GTFOBins.github.io /tmp/gtfobins && " +
  `node ${GENERATOR} /tmp/gtfobins`

// `Record<OffensiveAction, true>` is a compile-time exhaustiveness guard: adding or
// renaming a union member stops this file compiling instead of drifting silently.
const ACTION_COVERAGE: Record<OffensiveAction, true> = {
  execute: true, shell: true, "reverse-shell": true, "bind-shell": true, "file-read": true,
  "file-write": true, upload: true, download: true, "privilege-escalation": true,
  "credential-access": true, "defense-evasion": true, persistence: true, "lateral-movement": true,
  "uac-bypass": true, injection: true, recon: true,
}
const KNOWN_ACTIONS: readonly string[] = Object.keys(ACTION_COVERAGE)
const HEADLINE: readonly OffensiveAction[] = ["reverse-shell", "bind-shell", "privilege-escalation", "injection"]
const PLATFORM = ["linux", "macos", "unix"]
const MITRE_RE = /^T[0-9]+$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((e) => typeof e === "string")
const hasAll = (v: unknown, keys: string[], check: (x: unknown) => boolean): boolean =>
  isRecord(v) && keys.every((k) => check(v[k]))
const hasStrings = (v: unknown, keys: string[]): boolean => hasAll(v, keys, (x) => typeof x === "string")
const hasStringArrays = (v: unknown, keys: string[]): boolean => hasAll(v, keys, isStrings)

const isCommand = (v: unknown): v is PrimitiveCommand =>
  hasStrings(v, ["code", "description", "usecase", "category", "privileges"]) &&
  hasAll(v, ["contexts"], isStrings) &&
  (isRecord(v) && (v.variant === undefined || typeof v.variant === "string"))

const isPrimitive = (v: unknown): v is OffensivePrimitive =>
  hasStrings(v, ["source", "id", "binary", "name", "description"]) &&
  hasStringArrays(v, ["actions", "platform", "mitre", "tags"]) &&
  isRecord(v) &&
  Array.isArray(v.commands) &&
  v.commands.every(isCommand)

interface Corpus {
  readonly primitives: readonly OffensivePrimitive[]
  readonly pins: Readonly<Record<string, string>>
  readonly generatedAt: string
}

const isCorpus = (v: unknown): v is Corpus =>
  isRecord(v) &&
  Array.isArray(v.primitives) &&
  v.primitives.every(isPrimitive) &&
  isRecord(v.pins) &&
  typeof v.generatedAt === "string"

/**
 * The corpus is a generated local artifact, so an absent file means "run the
 * generator", never "skip". A failure names the command that fixes it.
 */
async function loadCorpus(): Promise<Corpus> {
  if (!existsSync(CORPUS_PATH)) {
    const build = Bun.spawnSync(["node", GENERATOR], { stdout: "pipe", stderr: "pipe" })
    if (build.exitCode !== 0 || !existsSync(CORPUS_PATH)) {
      throw new Error(
        `the corpus is absent at ${CORPUS_PATH} and generation failed (exit ${build.exitCode}).\n` +
          `stderr: ${build.stderr.toString().trim()}\n` +
          `generate it from your own clone with:\n  ${BUILD_COMMAND}`,
      )
    }
  }
  const raw: unknown = await Bun.file(CORPUS_PATH).json()
  if (!isCorpus(raw)) throw new Error(`${CORPUS_PATH} does not match the corpus contract`)
  return raw
}

const primitiveWithId = (corpus: Corpus, id: string): OffensivePrimitive => {
  const found = corpus.primitives.find((p) => p.id === id)
  if (found === undefined) throw new Error(`no primitive ${id} in the corpus`)
  return found
}

const generatorRun = (args: string[], env: Record<string, string | undefined> = {}) =>
  Bun.spawnSync(["node", GENERATOR, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })

describe("gtfobins corpus", () => {
  describe("#given the generated corpus artifact", () => {
    describe("#when it is loaded", () => {
      test("#then it parses and holds primitives", async () => {
        expect((await loadCorpus()).primitives.length).toBeGreaterThan(0)
      })
      test("#then primitives are sorted by id and name-spaced under gtfobins", async () => {
        const corpus = await loadCorpus()
        const ids = corpus.primitives.map((p) => p.id)
        expect(ids).toEqual([...ids].sort())
        for (const p of corpus.primitives) expect(p.id).toBe(`gtfobins:${p.binary}`)
      })
      test("#then each declares its source, platform and a non-empty action list", async () => {
        for (const p of (await loadCorpus()).primitives) {
          expect(p.source).toBe("gtfobins")
          expect([...p.platform]).toEqual(PLATFORM)
          expect(p.actions.length).toBeGreaterThan(0)
        }
      })
      test("#then the generator is re-runnable and byte-deterministic", async () => {
        const before = await Bun.file(CORPUS_PATH).text()
        expect(generatorRun(["", OUTPUT_ROOT]).exitCode).toBe(0)
        expect(await Bun.file(CORPUS_PATH).text()).toBe(before)
      })
      test("#then the output root resolves from argv, then env, then the default", async () => {
        const argRoot = join(OUTPUT_ROOT, "arg-root")
        const envRoot = join(OUTPUT_ROOT, "env-root")
        const fromArg = generatorRun(["", argRoot])
        const fromEnv = generatorRun([], { OMC_ARSENAL_ROOT: envRoot })
        expect(fromArg.exitCode).toBe(0)
        expect(fromArg.stdout.toString()).toContain(join(argRoot, "gtfobins.json"))
        expect(existsSync(join(argRoot, "gtfobins.json"))).toBe(true)
        expect(fromEnv.exitCode).toBe(0)
        expect(fromEnv.stdout.toString()).toContain(join(envRoot, "gtfobins.json"))
        expect(existsSync(join(envRoot, "gtfobins.json"))).toBe(true)
      })
    })
  })

  describe("#given the OffensiveAction union", () => {
    describe("#when the corpus actions are checked against it", () => {
      test("#then every action is a member of the union", async () => {
        const known = new Set(KNOWN_ACTIONS)
        const unknown = new Set<string>()
        for (const p of (await loadCorpus()).primitives) {
          for (const action of p.actions) if (!known.has(action)) unknown.add(action)
        }
        expect([...unknown]).toEqual([])
      })
      test("#then each action list is sorted and deduplicated", async () => {
        for (const p of (await loadCorpus()).primitives) {
          expect([...p.actions]).toEqual([...new Set(p.actions)].sort())
        }
      })
      test("#then the offensive headline actions are all represented", async () => {
        const actions = new Set<OffensiveAction>((await loadCorpus()).primitives.flatMap((p) => [...p.actions]))
        for (const action of HEADLINE) expect(actions.has(action)).toBe(true)
      })
    })
  })

  describe("#given the example-derived fields", () => {
    describe("#when commands and mitre are inspected", () => {
      test("#then every command carries a non-empty code string", async () => {
        for (const p of (await loadCorpus()).primitives) {
          expect(p.commands.length).toBeGreaterThan(0)
          for (const command of p.commands) expect(command.code.trim().length).toBeGreaterThan(0)
        }
      })
      test("#then every mitre value matches the technique-id shape and none is empty", async () => {
        for (const p of (await loadCorpus()).primitives) {
          expect(p.mitre.length).toBeGreaterThan(0)
          for (const technique of p.mitre) expect(technique).toMatch(MITRE_RE)
        }
      })
    })
  })

  describe("#given an alias-only record", () => {
    describe("#when its primitive is read", () => {
      test("#then awk resolves to mawk's actions and commands", async () => {
        const corpus = await loadCorpus()
        const alias = primitiveWithId(corpus, "gtfobins:awk")
        const target = primitiveWithId(corpus, "gtfobins:mawk")
        expect(alias.binary).toBe("awk")
        expect(alias.actions.length).toBeGreaterThan(0)
        expect([...alias.actions]).toEqual([...target.actions])
        expect(alias.commands.length).toBe(target.commands.length)
      })
      test("#then the two-hop chain rview -> view -> vim resolves to vim", async () => {
        const corpus = await loadCorpus()
        const chained = primitiveWithId(corpus, "gtfobins:rview")
        const target = primitiveWithId(corpus, "gtfobins:vim")
        expect(chained.actions.length).toBeGreaterThan(0)
        expect([...chained.actions]).toEqual([...target.actions])
        expect(chained.mitre.length).toBeGreaterThan(0)
      })
      test("#then an inherited function grants its source's actions", async () => {
        const corpus = await loadCorpus()
        const inheritor = primitiveWithId(corpus, "gtfobins:gdb")
        const python = primitiveWithId(corpus, "gtfobins:python")
        expect(inheritor.commands.some((c) => c.usecase === "inherit")).toBe(true)
        for (const action of python.actions) expect([...inheritor.actions]).toContain(action)
      })
    })
  })

  describe("#given the pin file", () => {
    describe("#when it is compared with the corpus", () => {
      test("#then it is one line naming the pinned commit", async () => {
        const corpus = await loadCorpus()
        expect(existsSync(PIN_PATH)).toBe(true)
        const pin = (await Bun.file(PIN_PATH).text()).trim()
        expect(pin).toMatch(/^[0-9a-f]{40}$/)
        expect(corpus.pins["gtfobins"]).toBe(pin)
        expect(corpus.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })
})
