import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { OmoConfigSchema } from "../packages/omc-config-core/src/schema"
import { createOmoJsonSchema } from "../script/build-omc-schema-document"

const REPO_ROOT = join(import.meta.dir, "..")
const SCHEMA_PATH = join(REPO_ROOT, "assets", "omc.schema.json")
const DOC_PATH = join(REPO_ROOT, "docs", "reference", "omc-json.md")

function extractSchemaExample(markdown: string): unknown {
  const fences = markdown.match(/```json\n([\s\S]*?)```/g) ?? []
  for (const fence of fences) {
    const body = fence.replace(/```json\n/, "").replace(/```$/, "")
    if (body.includes("\"$schema\"")) return JSON.parse(body)
  }
  throw new Error("no $schema-bearing json example found in omc-json.md")
}

describe("omc schema freshness", () => {
  test("#given the current Zod schema #when regenerated #then it matches the committed artifact", () => {
    // given
    const committed = readFileSync(SCHEMA_PATH, "utf-8")

    // when
    const regenerated = JSON.stringify(createOmoJsonSchema(), null, 2)

    // then
    expect(regenerated).toBe(committed)
  })

  test("#given the docs example omc.json #when parsed by OmoConfigSchema #then it validates", () => {
    // given
    const example = extractSchemaExample(readFileSync(DOC_PATH, "utf-8"))

    // when
    const result = OmoConfigSchema.safeParse(example)

    // then
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error.message)
  })

  test("#given the docs example #when read #then it points at the documented dev-branch schema URL", () => {
    // given
    const example = extractSchemaExample(readFileSync(DOC_PATH, "utf-8")) as { readonly $schema?: string }

    // when
    const schemaUrl = example.$schema

    // then
    expect(schemaUrl).toBe(
      "https://raw.githubusercontent.com/code-yeongyu/oh-my-cybersecurity/dev/assets/omc.schema.json",
    )
  })
})
