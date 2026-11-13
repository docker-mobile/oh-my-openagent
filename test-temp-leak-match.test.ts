import { describe, expect, test } from "bun:test"

import { isOsCreatedTempEntry, reportOnlyEntryMatches, reportOnlyOwner } from "./test-temp-leak-match"

describe("reportOnlyEntryMatches (#9766)", () => {
  test.each([
    ["omc-tui-", "omc-tui-xdg-Ab12Cd", true],
    ["omc-tui-", "omc-tui-", true],
    ["omc-tui-", "omc-tu", false],
    ["omc-tui-", "x-omc-tui-1", false],
    ["omc.js$", "omc.js", true],
    ["omc.js$", "omc.jsx", false],
    ["omc.js$", "omc.j", false],
    [".omc$", ".omc", true],
    [".omc$", ".omc-x", false],
  ])("entry %p against %p is %p", (entry, name, matches) => {
    expect(reportOnlyEntryMatches(entry, name)).toBe(matches)
  })
})

describe("isOsCreatedTempEntry (#9766)", () => {
  test.each([
    ["__PSScriptPolicyTest_2d0tpjsq.gy5.ps1", true],
    ["__PSScriptPolicyTest_b135vhjf.x1d.psm1", true],
    ["__PSScriptPolicyTest_2d0tpjsq.gy5.ps1.bak", false],
    ["x__PSScriptPolicyTest_2d0tpjsq.gy5.ps1", false],
    ["__PSScriptPolicyTest_2d0tpjsq.ps1", false],
    ["__PSScriptPolicyTest_2D0TPJSQ.GY5.ps1", false],
    ["__PSScriptPolicyTest_2d0tpjsq.gy5.psd1", false],
    ["__PSScriptPolicyTest_dir", false],
  ])("%p is OS-created: %p", (name, expected) => {
    expect(isOsCreatedTempEntry(name)).toBe(expected)
  })
})

describe("reportOnlyOwner (#9766)", () => {
  const list = { "omc-opencode": ["omc-cli-", "opencode$"], "team-core": ["team-mode-paths-"] }

  test.each([
    ["omc-cli-Zx9", "omc-opencode"],
    ["opencode", "omc-opencode"],
    ["team-mode-paths-1", "team-core"],
    ["opencode-data", undefined],
    ["brand-new-leak-", undefined],
  ])("%p is owned by %p", (name, owner) => {
    expect(reportOnlyOwner(name, list)).toBe(owner)
  })
})
