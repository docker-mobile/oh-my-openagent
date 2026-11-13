import { describe, expect, test } from "bun:test"
import { isOmoPath } from "./omc-path"

describe("isOmoPath", () => {
  test("#given a path under an omc directory #when checking the path #then it matches the omc segment", () => {
    expect(isOmoPath(".omc/plans/work.md")).toBe(true)
    expect(isOmoPath("/repo/.omc/plans/work.md")).toBe(true)
    expect(isOmoPath(String.raw`C:\repo\.omc\plans\work.md`)).toBe(true)
  })

  test("#given a path whose directory merely ends with omc #when checking the path #then it does not match", () => {
    expect(isOmoPath("/repo/work.omc/plans/work.md")).toBe(false)
    expect(isOmoPath("/repo/.omc-backup/plans/work.md")).toBe(false)
    expect(isOmoPath("/repo/notes.omc")).toBe(false)
  })
})
