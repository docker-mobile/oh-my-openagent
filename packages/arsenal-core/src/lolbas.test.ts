import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import {
  CATEGORY_ACTIONS,
  DEFAULT_SOURCE_DIR,
  GENERATOR_PATH,
  OUTPUT_ROOT_ENV,
  PACKAGE_ROOT,
  SOURCE_DIR_ENV,
  UPSTREAM_URL,
  operatorCommand,
  resolveOutputRoot,
  resolveSourceDir,
} from "../script/generate-lolbas.mjs"

// Generated local artifact, never committed: upstream is GPL-3.0, this repo is
// SUL-1.0. Absent here means rebuild it, not skip the test.
const OUTPUT_ROOT = resolveOutputRoot({ env: process.env })
const CORPUS_PATH = join(OUTPUT_ROOT, "lolbas.json")
const PIN_PATH = join(OUTPUT_ROOT, "lolbas.pin.txt")
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..")
const MAPPING: Readonly<Record<string, string>> = CATEGORY_ACTIONS
const EXPECTED_PRIMITIVES = 248
const MITRE_RE = /^T[0-9]{4}(\.[0-9]{3})?$/
const ID_PREFIX = "lolbas:"

const OPERATOR_HINT = `build the upstream corpus from your own clone:\n  ${operatorCommand(DEFAULT_SOURCE_DIR)}`

const OFFENSIVE_ACTIONS: readonly string[] = [
  "execute",
  "shell",
  "reverse-shell",
  "bind-shell",
  "file-read",
  "file-write",
  "upload",
  "download",
  "privilege-escalation",
  "credential-access",
  "defense-evasion",
  "persistence",
  "lateral-movement",
  "uac-bypass",
  "injection",
  "recon",
]

interface Command {
  readonly code: string
  readonly category: string
  readonly contexts: readonly string[]
}

interface Primitive {
  readonly source: string
  readonly id: string
  readonly name: string
  readonly platform: readonly string[]
  readonly actions: readonly string[]
  readonly mitre: readonly string[]
  readonly tags: readonly string[]
  readonly commands: readonly Command[]
}

interface Corpus {
  readonly primitives: readonly Primitive[]
  readonly pins: Readonly<Record<string, string>>
  readonly generatedAt: string
}

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")

// Deliberately not shared with the generator: a validator owned by the producer
// would agree with any bug the producer gained.
const isPrimitive = (value: unknown): boolean =>
  isRow(value) &&
  typeof value.source === "string" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  isStringArray(value.platform) &&
  isStringArray(value.actions) &&
  isStringArray(value.mitre) &&
  isStringArray(value.tags) &&
  Array.isArray(value.commands) &&
  value.commands.every(
    (command) =>
      isRow(command) &&
      typeof command.code === "string" &&
      typeof command.category === "string" &&
      isStringArray(command.contexts),
  )

const isCorpus = (value: unknown): value is Corpus =>
  isRow(value) &&
  Array.isArray(value.primitives) &&
  value.primitives.every(isPrimitive) &&
  isRow(value.pins) &&
  typeof value.generatedAt === "string"

// Ambient overrides dropped so an arg-driven test cannot inherit them; the
// bootstrap passes the real environment through deliberately.
const CLEAN_ENV: Record<string, string | undefined> = (() => {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env[OUTPUT_ROOT_ENV]
  delete env[SOURCE_DIR_ENV]
  return env
})()

interface RunOptions {
  readonly outputRoot?: string
  readonly sourceDir?: string
  readonly env?: Record<string, string | undefined>
}

async function runGenerator(options: RunOptions = {}) {
  const argv = [process.execPath, GENERATOR_PATH]
  const sourceDir = options.sourceDir ?? (options.outputRoot === undefined ? undefined : resolveSourceDir({ env: CLEAN_ENV }))
  if (sourceDir !== undefined) argv.push(sourceDir)
  if (options.outputRoot !== undefined) argv.push(options.outputRoot)

  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: options.env ?? CLEAN_ENV })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

let bootstrapped: Promise<void> | undefined

function ensureCorpus(): Promise<void> {
  if (bootstrapped !== undefined) return bootstrapped
  bootstrapped = (async () => {
    if (existsSync(CORPUS_PATH)) return
    const { stdout, stderr, exitCode } = await runGenerator({ env: process.env })
    if (exitCode !== 0 || !existsSync(CORPUS_PATH)) {
      throw new Error(
        `the corpus is absent at ${CORPUS_PATH} and generating it failed (exit ${exitCode}):\n` +
          `${stderr.trim() || stdout.trim()}\n${OPERATOR_HINT}`,
      )
    }
  })()
  return bootstrapped
}

async function loadCorpus(): Promise<Corpus> {
  await ensureCorpus()
  const raw: unknown = await Bun.file(CORPUS_PATH).json()
  if (!isCorpus(raw)) throw new Error(`${CORPUS_PATH} does not match the corpus contract`)
  return raw
}

function categoriesIn(corpus: Corpus): Set<string> {
  return new Set(corpus.primitives.flatMap((primitive) => primitive.commands.map((command) => command.category)))
}

function allActions(corpus: Corpus): Set<string> {
  return new Set(corpus.primitives.flatMap((primitive) => [...primitive.actions]))
}

function withTempRoot<T>(prefix: string, body: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), prefix))
  return body(root).finally(() => rmSync(root, { recursive: true, force: true }))
}

describe("lolbas corpus as a generated local artifact", () => {
  describe("#given the resolved output root", () => {
    describe("#when the corpus file is absent", () => {
      test("#then the generator is run and its output is asserted on", async () => {
        const existed = existsSync(CORPUS_PATH)
        await ensureCorpus()

        expect(existsSync(CORPUS_PATH)).toBe(true)
        expect(existsSync(PIN_PATH)).toBe(true)
        const corpus = await loadCorpus()
        expect(corpus.primitives.length).toBe(EXPECTED_PRIMITIVES)
        if (!existed) expect(corpus.pins.lolbas).toMatch(/^[0-9a-f]{40}$/)
      })
    })

    describe("#when the resolution order is exercised", () => {
      test("#then an explicit output directory wins over the environment", () => {
        const root = resolveOutputRoot({ explicit: "/tmp/explicit-root", env: { [OUTPUT_ROOT_ENV]: "/tmp/env-root" } })
        expect(root).toBe("/tmp/explicit-root")
      })

      test("#then the environment wins over the package default", () => {
        expect(resolveOutputRoot({ env: { [OUTPUT_ROOT_ENV]: "/tmp/env-root" } })).toBe("/tmp/env-root")
        expect(resolveOutputRoot({ env: {} })).toBe(join(PACKAGE_ROOT, "data"))
      })

      test("#then a blank environment value falls through to the package default", () => {
        expect(resolveOutputRoot({ env: { [OUTPUT_ROOT_ENV]: "   " } })).toBe(join(PACKAGE_ROOT, "data"))
      })

      test("#then the source directory resolves the same way", () => {
        const explicit = resolveSourceDir({ explicit: "/tmp/explicit-src", env: { [SOURCE_DIR_ENV]: "/tmp/env-src" } })
        expect(explicit).toBe("/tmp/explicit-src")
        expect(resolveSourceDir({ env: { [SOURCE_DIR_ENV]: "/tmp/env-src" } })).toBe("/tmp/env-src")
        expect(resolveSourceDir({ env: {} })).toBe(resolve(DEFAULT_SOURCE_DIR))
      })
    })
  })

  describe("#given the generated corpus", () => {
    describe("#when it is loaded", () => {
      test("#then every id is prefixed, unique and sorted", async () => {
        const corpus = await loadCorpus()
        const ids = corpus.primitives.map((primitive) => primitive.id)

        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) expect(id.startsWith(ID_PREFIX)).toBe(true)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toEqual([...ids].sort())
      })

      test("#then every primitive is Windows-sourced with a non-empty command list", async () => {
        const corpus = await loadCorpus()
        for (const primitive of corpus.primitives) {
          expect(primitive.source).toBe("lolbas")
          expect([...primitive.platform]).toEqual(["windows"])
          expect(primitive.commands.length).toBeGreaterThan(0)
          for (const command of primitive.commands) {
            expect(command.code.trim().length).toBeGreaterThan(0)
            expect(command.contexts).toEqual([])
          }
        }
      })
    })
  })

  describe("#given the category-to-action mapping", () => {
    describe("#when the corpus is inspected", () => {
      test("#then every category in the data is mapped and the mapping is fully exercised", async () => {
        const corpus = await loadCorpus()
        const found = categoriesIn(corpus)

        expect(found.size).toBe(15)
        for (const category of found) expect(MAPPING[category]).toBeDefined()
        for (const category of Object.keys(MAPPING)) expect(found.has(category)).toBe(true)
      })

      test("#then each category produced its mapped action on the primitive carrying it", async () => {
        const corpus = await loadCorpus()
        for (const [category, action] of Object.entries(MAPPING)) {
          const carriers = corpus.primitives.filter((primitive) =>
            primitive.commands.some((command) => command.category === category),
          )
          expect(carriers.length).toBeGreaterThan(0)
          for (const carrier of carriers) expect([...carrier.actions]).toContain(action)
        }
      })

      test("#then every emitted action is a member of the OffensiveAction union", async () => {
        const corpus = await loadCorpus()
        for (const action of allActions(corpus)) expect(OFFENSIVE_ACTIONS).toContain(action)
      })

      test("#then uac-bypass and credential-access are both represented", async () => {
        const actions = allActions(await loadCorpus())
        expect(actions.has("uac-bypass")).toBe(true)
        expect(actions.has("credential-access")).toBe(true)
      })
    })
  })

  describe("#given the lifted MITRE techniques and tags", () => {
    describe("#when they are inspected", () => {
      test("#then every mitre value matches the technique-id shape and is deduplicated and sorted", async () => {
        const corpus = await loadCorpus()
        for (const primitive of corpus.primitives) {
          expect([...primitive.mitre]).toEqual([...new Set(primitive.mitre)].sort())
          for (const technique of primitive.mitre) expect(technique).toMatch(MITRE_RE)
        }
      })

      test("#then tags are deduplicated and sorted", async () => {
        const corpus = await loadCorpus()
        for (const primitive of corpus.primitives) {
          expect([...primitive.tags]).toEqual([...new Set(primitive.tags)].sort())
        }
      })
    })
  })

  describe("#given the pin file", () => {
    describe("#when it is compared with the corpus", () => {
      test("#then it is one line naming the pinned commit", async () => {
        const corpus = await loadCorpus()
        const pin = (await Bun.file(PIN_PATH).text()).trim()

        expect(pin).toMatch(/^[0-9a-f]{40}$/)
        expect(corpus.pins.lolbas).toBe(pin)
        expect(corpus.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })

  describe("#given the generator command line", () => {
    describe("#when it is pointed at an explicit output directory", () => {
      test("#then it creates the directory and prints the absolute paths it wrote", async () => {
        await withTempRoot("lolbas-out-", async (root) => {
          const target = join(root, "nested", "data")
          const { stdout, exitCode } = await runGenerator({ outputRoot: target })

          expect(exitCode).toBe(0)
          expect(stdout).toContain(`wrote ${join(target, "lolbas.json")}`)
          expect(stdout).toContain(`wrote ${join(target, "lolbas.pin.txt")}`)
          const generated: unknown = await Bun.file(join(target, "lolbas.json")).json()
          expect(isCorpus(generated)).toBe(true)
          if (isCorpus(generated)) expect(generated.primitives.length).toBe(EXPECTED_PRIMITIVES)
        })
      })
    })

    describe("#when no usable source exists", () => {
      test("#then an unusable source directory fails with the operator command to run", async () => {
        await withTempRoot("lolbas-bad-", async (root) => {
          const { stderr, exitCode } = await runGenerator({
            outputRoot: join(root, "data"),
            sourceDir: join(root, "no-such-checkout"),
          })

          expect(exitCode).not.toBe(0)
          expect(stderr).toContain(UPSTREAM_URL)
          expect(stderr).toContain("generate-lolbas.mjs")
        })
      })

      test("#then an absent corpus fails instead of skipping and writes nothing", async () => {
        await withTempRoot("lolbas-absent-", async (root) => {
          const { stderr, exitCode } = await runGenerator({
            outputRoot: root,
            sourceDir: join(root, "missing-upstream"),
          })

          expect(exitCode).not.toBe(0)
          expect(stderr).toContain(`git clone --depth 1 ${UPSTREAM_URL}`)
          expect(stderr).toContain("generate-lolbas.mjs")
          expect(existsSync(join(root, "lolbas.json"))).toBe(false)
        })
      })
    })
  })

  describe("#given the license constraint", () => {
    describe("#when the repository tracks the data directory", () => {
      test("#then the derived corpus is not tracked", () => {
        const proc = Bun.spawnSync(["git", "-C", REPO_ROOT, "ls-files", "packages/arsenal-core/data"])
        expect(proc.exitCode).toBe(0)
        expect(proc.stdout.toString().trim()).toBe("")
      })
    })
  })
})
