/**
 * Guards the generated payload corpus: the renderer and the wordlist consumers
 * code against these shapes. Corpora are read from disk through
 * `import.meta.dir`, never statically imported - the repo bundle budget is
 * already exceeded and a static import would inline megabytes into the bundle.
 */

import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { PAYLOAD_KINDS, type PayloadKind, type PayloadTemplate, type WordlistEntry } from "./types"
import { kindForCategory } from "../script/generate-payloads.mjs"

function isPayloadKind(value: string): value is PayloadKind {
  return (PAYLOAD_KINDS as readonly string[]).includes(value)
}

const DATA_ROOT = join(import.meta.dir, "..", "data")
const TEMPLATES_FILE = join(DATA_ROOT, "templates.json")
const WORDLISTS_FILE = join(DATA_ROOT, "wordlists.json")
const PIN_FILE = join(DATA_ROOT, "payloads.pin.txt")

interface TemplatesCorpus {
  readonly templates: readonly PayloadTemplate[]
  readonly pin: string
  readonly generatedAt: string
}

interface WordlistsCorpus {
  readonly families: readonly (WordlistEntry & { readonly sha256: string })[]
  readonly pin: string
  readonly generatedAt: string
}

const templatesCorpus = (await Bun.file(TEMPLATES_FILE).json()) as TemplatesCorpus
const wordlistsCorpus = (await Bun.file(WORDLISTS_FILE).json()) as WordlistsCorpus
const pinFile = (await Bun.file(PIN_FILE).text()).trim()

console.log(
  `payload-forge corpus: ${templatesCorpus.templates.length} templates, ` +
    `${wordlistsCorpus.families.length} wordlist families, pin ${templatesCorpus.pin}`,
)

describe("templates corpus", () => {
  describe("#given the generated templates.json", () => {
    test("#when it is parsed #then it carries a non-empty template list and a pin", () => {
      expect(Array.isArray(templatesCorpus.templates)).toBe(true)
      expect(templatesCorpus.templates.length).toBeGreaterThan(0)
      expect(templatesCorpus.templates.length).toBe(132)
      expect(templatesCorpus.pin).toMatch(/^[0-9a-f]{40}$/)
      expect(templatesCorpus.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test("#when every template id is inspected #then each is addressable under the pat: prefix", () => {
      const ids = templatesCorpus.templates.map((template) => template.id)
      for (const id of ids) expect(id.startsWith("pat:")).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    })

    test("#when every template kind is inspected #then each is a member of PayloadKind", () => {
      const kinds = new Set<string>()
      for (const template of templatesCorpus.templates) {
        expect(PAYLOAD_KINDS).toContain(template.kind)
        kinds.add(template.kind)
      }
      expect(kinds.size).toBeGreaterThan(1)
    })

    test("#when the bodies are scanned #then the literal section-variable token survives", () => {
      const templated = templatesCorpus.templates.filter((template) => template.body.includes("\u00a7"))
      expect(templated.length).toBeGreaterThan(0)
      for (const template of templated) {
        const delimiters = template.body.split("\u00a7").length - 1
        expect(delimiters % 2).toBe(0)
        expect(template.body).toMatch(/\u00a7[A-Za-z0-9_]+\u00a7/)
      }
    })

    test("#when a templated body is checked against its variables #then every token is declared", () => {
      for (const template of templatesCorpus.templates) {
        if (!template.body.includes("\u00a7")) continue
        const tokens = template.body.match(/\u00a7[^\u00a7]*\u00a7/g) ?? []
        const declared = template.variables.map((variable) => variable.name)
        for (const token of tokens) {
          expect(declared).toContain(token.replace(/\u00a7/g, ""))
        }
      }
    })

    test("#when variable metadata is inspected #then no description was invented", () => {
      for (const template of templatesCorpus.templates) {
        for (const variable of template.variables) {
          expect(variable.description).toBe("")
          expect(variable.defaultValue).toBeNull()
        }
      }
    })

    test("#when provenance fields are inspected #then category, source and tags are present", () => {
      for (const template of templatesCorpus.templates) {
        expect(template.category.length).toBeGreaterThan(0)
        expect(template.source).toBe("hopla_config.json")
        expect(template.tags).toEqual([template.category.toLowerCase()])
        expect(template.id).toMatch(/^pat:[a-z0-9-]+:[a-z0-9-]+$/)
      }
    })
  })
})

describe("category to kind mapping", () => {
  describe("#given the categories actually present in the corpus", () => {
    test("#when each is mapped #then the mapping is total and matches the generated kind", () => {
      const seen = new Set<string>()
      for (const template of templatesCorpus.templates) {
        if (seen.has(template.category)) continue
        seen.add(template.category)
        const mapped = kindForCategory(template.category)
        expect(isPayloadKind(mapped)).toBe(true)
        if (!isPayloadKind(mapped)) continue
        expect(mapped).toBe(template.kind)
      }
      expect(seen.size).toBe(16)
    })

    test("#when an unknown category appears #then it maps to other and is never dropped", () => {
      expect(kindForCategory("Brand New Category From Upstream")).toBe("other")
      expect(kindForCategory("")).toBe("other")
      expect(isPayloadKind(kindForCategory("Brand New Category From Upstream"))).toBe(true)
    })
  })
})

describe("wordlist index", () => {
  describe("#given the generated wordlists.json", () => {
    test("#when it is parsed #then it indexes 60 or more families sorted by id", () => {
      const families = wordlistsCorpus.families
      expect(families.length).toBeGreaterThanOrEqual(60)
      expect(families.length).toBe(69)
      const ids = families.map((family) => family.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toEqual([...ids].sort())
    })

    test("#when each family is inspected #then it has lines and a verifiable digest", () => {
      for (const family of wordlistsCorpus.families) {
        expect(family.id.startsWith("wl:")).toBe(true)
        expect(family.family.length).toBeGreaterThan(0)
        expect(family.lines).toBeGreaterThan(0)
        expect(family.sha256).toMatch(/^[0-9a-f]{64}$/)
      }
    })

    test("#when the source paths are inspected #then they stay relative to the source root", () => {
      for (const family of wordlistsCorpus.families) {
        expect(family.sourcePath.startsWith("/")).toBe(false)
        expect(family.sourcePath).toContain("Intruder")
        expect(family.sourcePath).not.toContain("..")
      }
    })

    test("#when the bodies are considered #then no wordlist body is inlined in the index", () => {
      const serialized = JSON.stringify(wordlistsCorpus)
      expect(serialized.length).toBeLessThan(200_000)
      expect(new Set(wordlistsCorpus.families.flatMap((family) => Object.keys(family)))).toEqual(
        new Set(["id", "family", "lines", "sourcePath", "sha256"]),
      )
    })
  })
})

describe("corpus provenance and cwd independence", () => {
  describe("#given the pin file and a process started outside the repo", () => {
    test("#when the pin file is read #then it pins the same commit as both corpora", () => {
      expect(pinFile).toMatch(/^[0-9a-f]{40}$/)
      expect(templatesCorpus.pin).toBe(pinFile)
      expect(wordlistsCorpus.pin).toBe(pinFile)
    })

    test("#when a child process in another cwd resolves the data root #then it reads the same corpus", async () => {
      const loaderUrl = new URL("./loader.ts", import.meta.url).href
      const probe = [
        `const loader = await import(${JSON.stringify(loaderUrl)})`,
        `const root = loader.defaultDataRoot()`,
        `const corpus = await Bun.file(root + "/templates.json").json()`,
        `const wordlists = await Bun.file(root + "/wordlists.json").json()`,
        `console.log("PROBE " + root + " " + corpus.templates.length + " " + wordlists.families.length)`,
      ].join("\n")

      const child = Bun.spawn(["bun", "-e", probe], {
        cwd: "/tmp",
        stdout: "pipe",
        stderr: "pipe",
      })
      const stdout = await new Response(child.stdout).text()
      const stderr = await new Response(child.stderr).text()
      const exitCode = await child.exited

      expect(stderr).toBe("")
      expect(exitCode).toBe(0)
      expect(stdout).toContain(`PROBE ${DATA_ROOT} `)
      expect(stdout.trim()).toContain(`${templatesCorpus.templates.length} ${wordlistsCorpus.families.length}`)
    })
  })
})
