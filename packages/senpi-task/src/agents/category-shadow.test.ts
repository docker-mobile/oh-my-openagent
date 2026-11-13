import { describe, expect, test } from "bun:test"

import { categoryShadowedAgentNames } from "./category-shadow"

describe("categoryShadowedAgentNames", () => {
  test("#given a chain set under a retired alias key #when a category uses the canonical name #then it is still reported", () => {
    // given: omc.json agents are mapped by their key as written, so a chain under the old reviewer
    // name never reaches the canonical agent, which still runs its default chain.
    const config = {
      categories: { "omc-native-code-reviewer": { model: "a/b" } },
      agents: { "omc-senpi-code-reviewer": { model: "x/y" } },
    }

    // when
    const names = categoryShadowedAgentNames(config)

    // then
    expect(names).toEqual(["omc-native-code-reviewer"])
  })

  test("#given the canonical agent sets its own model #when a category uses its name #then it is not reported", () => {
    // given
    const config = {
      categories: { "omc-native-code-reviewer": { model: "a/b" } },
      agents: { "omc-native-code-reviewer": { model: "x/y" } },
    }

    // when
    const names = categoryShadowedAgentNames(config)

    // then
    expect(names).toEqual([])
  })
})
