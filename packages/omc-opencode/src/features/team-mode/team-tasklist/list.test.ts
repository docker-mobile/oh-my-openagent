import { describe, expect, test } from "bun:test"

import { listTasks } from "./list"
import { listTasks as coreListTasks } from "@oh-my-cybersecurity/team-core/team-tasklist/list"

describe("listTasks adapter shim", () => {
  test("#given omc-opencode shim #when imported #then it re-exports team-core implementation", () => {
    expect(listTasks).toBe(coreListTasks)
  })
})
