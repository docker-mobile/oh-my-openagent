import { describe, expect, test } from "bun:test"

import { createWorktree, validateWorktreeSpec } from "./manager"
import {
  createWorktree as coreCreateWorktree,
  validateWorktreeSpec as coreValidateWorktreeSpec,
} from "@oh-my-cybersecurity/team-core/team-worktree/manager"

describe("team-worktree manager adapter shim", () => {
  test("#given omc-opencode shim #when imported #then it re-exports team-core implementation", () => {
    expect(createWorktree).toBe(coreCreateWorktree)
    expect(validateWorktreeSpec).toBe(coreValidateWorktreeSpec)
  })
})
