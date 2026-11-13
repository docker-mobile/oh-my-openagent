import { describe, expect, test } from "bun:test"

import { ackMessages } from "./ack"
import { ackMessages as coreAckMessages } from "@oh-my-cybersecurity/team-core/team-mailbox/ack"

describe("ackMessages adapter shim", () => {
  test("#given omc-opencode shim #when imported #then it re-exports team-core implementation", () => {
    expect(ackMessages.name).toBe(coreAckMessages.name)
    expect(ackMessages.length).toBe(coreAckMessages.length)
  })
})
