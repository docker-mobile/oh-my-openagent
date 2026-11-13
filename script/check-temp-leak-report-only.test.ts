import { describe, expect, test } from "bun:test"

import { addedReportOnlyEntries } from "./check-temp-leak-report-only.mjs"

// Contract: the report-only temp-leak list may only shrink (#9766). A change that adds a prefix to an
// existing owner, or a new owner, must be named; a change that only removes entries passes.
describe("addedReportOnlyEntries", () => {
  test("#given entries only removed #when compared #then nothing is added", () => {
    const base = { "omc-codex": ["omc-codex-agents-", "omc-codex-cache-"], "team-core": ["worktree-"] }
    const head = { "omc-codex": ["omc-codex-cache-"] }

    expect(addedReportOnlyEntries(base, head)).toEqual([])
  })

  test("#given a prefix added to a listed owner and a new owner #when compared #then both are named", () => {
    const base = { "omc-codex": ["omc-codex-cache-"] }
    const head = { "omc-codex": ["omc-codex-cache-", "omc-codex-new-"], "boulder-state": ["boulder-stale-"] }

    expect(addedReportOnlyEntries(base, head)).toEqual(["boulder-state: boulder-stale-", "omc-codex: omc-codex-new-"])
  })

  test("#given a prefix replaced by narrower names under it #when compared #then nothing is added", () => {
    const base = { "omc-opencode": ["omc-test-"] }
    const head = { "omc-opencode": ["omc-test-session-manager-", "omc-test-x.log$"] }

    expect(addedReportOnlyEntries(base, head)).toEqual([])
  })

  test("#given a broader prefix or a name under an exact entry #when compared #then both are additions", () => {
    const base = { "omc-opencode": ["omc-test-session-", "omc.js$"] }
    const head = { "omc-opencode": ["omc-test-", "omc.js.map$"] }

    expect(addedReportOnlyEntries(base, head)).toEqual(["omc-opencode: omc-test-", "omc-opencode: omc.js.map$"])
  })

  test("#given a prefix moved between owners #when compared #then the move counts as an addition", () => {
    const base = { "omc-opencode": ["skill-content-test-"] }
    const head = { "skills-loader-core": ["skill-content-test-"] }

    expect(addedReportOnlyEntries(base, head)).toEqual(["skills-loader-core: skill-content-test-"])
  })
})
