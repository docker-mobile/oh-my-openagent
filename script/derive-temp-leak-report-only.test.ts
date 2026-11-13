import { describe, expect, test } from "bun:test"

import { deriveTempEntries, hasSourceCreator, ownerOf } from "./derive-temp-leak-report-only"

describe("deriveTempEntries (#9766)", () => {
  test("#given mkdtemp literal, template and helper creators #when derived #then each yields its prefix", () => {
    const source = [
      'mkdtempSync(join(tmpdir(), "omc-cli-"))',
      "mkdtempSync(join(tmpdir(), `omc-tui-${label}-`))",
      "await mkdtemp(`${tmpdir()}/omc-mirror-`)",
      'const dir = createTempDir("omc-helper-")',
    ].join("\n")

    expect(deriveTempEntries(source)).toEqual(["omc-cli-", "omc-helper-", "omc-mirror-", "omc-tui-"])
  })

  test("#given a fixed name joined under the temp dir #when derived #then it is an exact entry", () => {
    expect(deriveTempEntries('const log = join(tmpdir(), "omc.js")')).toEqual(["omc.js$"])
  })

  test("#given a temp path built by concatenation #when derived #then the literal part is a prefix", () => {
    expect(deriveTempEntries('const dir = join(tmpdir(), "omc-concat-" + id)')).toEqual(["omc-concat-"])
  })

  test("#given no temp creator #when derived #then nothing is listed", () => {
    expect(deriveTempEntries('mkdirSync(join(projectDir, "omc-cli-"))')).toEqual([])
  })
})

describe("hasSourceCreator (#9766)", () => {
  test.each([
    ["omc-cli-", ["omc-cli-"], true],
    ["omc-", ["omc-cli-"], true],
    ["omc-sg-runner-", ["omc-"], true],
    ["omc-cli.log$", ["omc-"], true],
    ["omc.js$", ["omc.js$"], true],
    ["omc-sg-runner-", ["omc-sg$"], false],
    ["boulder-stale-", ["omc-"], false],
  ])("entry %p with creators %p has a creator: %p", (entry, creators, expected) => {
    expect(hasSourceCreator(entry, creators)).toBe(expected)
  })
})

describe("ownerOf (#9766)", () => {
  test.each([
    ["packages/omc-opencode/src/cli/install.test.ts", "omc-opencode"],
    ["script/build.test.ts", "script"],
    ["postinstall.test.ts", "postinstall.test.ts"],
  ])("%p is owned by %p", (file, owner) => {
    expect(ownerOf(file)).toBe(owner)
  })
})
