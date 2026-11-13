import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

import {
  defaultDataRoot as arsenalDataRoot,
  loadIndex,
  loadPrimitives,
} from "../../arsenal-core/src/loader"
import {
  defaultDataRoot as playbookDataRoot,
  loadPlaybookIndex,
  loadTechniques,
} from "../../attack-playbook-core/src/loader"
import {
  defaultDataRoot as payloadDataRoot,
  loadPayloadIndex,
  loadTemplates,
  loadWordlists,
} from "../../payload-forge-core/src/loader"

// The corpora are generated local artifacts and are gitignored, so a fresh clone has
// none. Generate them here exactly as the per-source tests do: an absent corpus means
// "run the generator", never "fail" and never "skip", so this file is honest on a
// clean checkout and in CI without pretending the data is committed.
// Each generator writes its OWN artifact, so the presence check must name the file that
// generator produces - checking a shared path would report a false failure.
function ensureArtifact(artifact: string, generator: string): void {
  if (existsSync(artifact)) return

  const build = Bun.spawnSync(["node", generator], { stdout: "pipe", stderr: "pipe" })
  if (build.exitCode !== 0 || !existsSync(artifact)) {
    throw new Error(
      `the corpus artifact is absent at ${artifact} and generation failed (exit ${build.exitCode}).\n` +
        `stderr: ${build.stderr.toString().trim()}\n` +
        `generate it from your own clone with:\n  node ${generator} <dir-with-upstream-clone>`,
    )
  }
}

const ARSENAL_PACKAGE = join(dirname(import.meta.dir), "..", "arsenal-core")
const PLAYBOOK_PACKAGE = join(dirname(import.meta.dir), "..", "attack-playbook-core")
const PAYLOAD_PACKAGE = join(dirname(import.meta.dir), "..", "payload-forge-core")

function ensureAllCorpora(): void {
  const arsenal = arsenalDataRoot()
  ensureArtifact(join(arsenal, "gtfobins.json"), join(ARSENAL_PACKAGE, "script", "generate-gtfobins.mjs"))
  ensureArtifact(join(arsenal, "lolbas.json"), join(ARSENAL_PACKAGE, "script", "generate-lolbas.mjs"))
  ensureArtifact(join(arsenal, "index.json"), join(ARSENAL_PACKAGE, "script", "generate-index.mjs"))
  ensureArtifact(join(playbookDataRoot(), "techniques.json"), join(PLAYBOOK_PACKAGE, "script", "generate-playbook.mjs"))
  ensureArtifact(join(payloadDataRoot(), "templates.json"), join(PAYLOAD_PACKAGE, "script", "generate-payloads.mjs"))
}

ensureAllCorpora()

// Guards the regression that survived a green suite: no other test called these
// loaders, so an envelope/array mismatch between generator and reader went unseen.
describe("corpus loaders read the generator's real output", () => {
  test("#given the shipped techniques corpus #when loaded through the runtime loader #then it returns every technique", async () => {
    // given / when
    const techniques = await loadTechniques(playbookDataRoot())

    // then
    expect(techniques.length).toBeGreaterThan(100)
    expect(techniques[0]?.id).toMatch(/^T[0-9]{4}/)
    expect(techniques.some((technique) => technique.atomics.length > 0)).toBe(true)
  })

  test("#given the shipped techniques corpus #when the playbook index is loaded #then its counts agree with what was loaded", async () => {
    // given
    const techniques = await loadTechniques(playbookDataRoot())

    // when
    const index = await loadPlaybookIndex(playbookDataRoot())

    // then
    expect(index.techniques).toBe(techniques.length)
    expect(index.atomics).toBe(
      techniques.reduce((total, technique) => total + technique.atomics.length, 0),
    )
    expect(index.pin).toMatch(/^[0-9a-f]{40}$/)
  })

  test("#given the shipped payload corpus #when loaded through the runtime loader #then templates carry a valid kind", async () => {
    // given / when
    const templates = await loadTemplates(payloadDataRoot())

    // then
    expect(templates.length).toBeGreaterThan(50)
    expect(templates.every((template) => typeof template.body === "string")).toBe(true)
    expect(templates.some((template) => template.body.includes("\u00a7"))).toBe(true)
  })

  test("#given the shipped payload corpus #when the wordlist index is loaded #then every family carries integrity fields", async () => {
    // given / when
    const families = await loadWordlists(payloadDataRoot())

    // then
    expect(families.length).toBeGreaterThan(10)
    expect(families.every((entry) => Number.isInteger(entry.lines) && entry.lines >= 0)).toBe(true)
  })

  test("#given the shipped payload corpus #when the derived index is requested #then its counts match the loaded corpora", async () => {
    // given
    const templates = await loadTemplates(payloadDataRoot())
    const families = await loadWordlists(payloadDataRoot())

    // when
    const index = await loadPayloadIndex(payloadDataRoot())

    // then
    expect(index.templates).toBe(templates.length)
    expect(index.families).toBe(families.length)
    expect(index.pin.length).toBeGreaterThan(0)
  })

  test("#given an absent corpus root #when the loader runs #then it throws a typed error naming the path instead of returning empty", async () => {
    // given
    const missing = "/nonexistent-corpus-root-for-test"

    // when / then
    await expect(loadTechniques(missing)).rejects.toThrow(/missing/)
    await expect(loadTemplates(missing)).rejects.toThrow(/missing/)
  })

  test("#given the shipped arsenal corpus #when primitives are loaded #then both sources unwrap their envelope", async () => {
    // given
    const dataRoot = arsenalDataRoot()

    // when
    const unix = await loadPrimitives(dataRoot, "gtfobins")
    const windows = await loadPrimitives(dataRoot, "lolbas")

    // then
    expect(unix.length).toBeGreaterThan(100)
    expect(windows.length).toBeGreaterThan(100)
    expect(unix.every((primitive) => primitive.source === "gtfobins")).toBe(true)
    expect(windows.every((primitive) => primitive.source === "lolbas")).toBe(true)
  })

  test("#given the shipped arsenal corpus #when the index is loaded #then its counts agree with the primitives", async () => {
    // given
    const dataRoot = arsenalDataRoot()

    // when
    const [index, unix, windows] = await Promise.all([
      loadIndex(dataRoot),
      loadPrimitives(dataRoot, "gtfobins"),
      loadPrimitives(dataRoot, "lolbas"),
    ])

    // then
    expect(index.sources.gtfobins).toBe(unix.length)
    expect(index.sources.lolbas).toBe(windows.length)
    expect(index.upstreamPins.gtfobins).toMatch(/^[0-9a-f]{40}$/)
  })
})
