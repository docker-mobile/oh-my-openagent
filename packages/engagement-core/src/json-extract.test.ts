import { describe, expect, test } from "bun:test"

import { extractJsonObject } from "./json-extract"

describe("extractJsonObject", () => {
  test("#given a bare json object #when extracted #then it parses", () => {
    expect(extractJsonObject('{"decision":"noop"}')).toEqual({ decision: "noop" })
  })

  test("#given a prose preamble and trailing commentary #when extracted #then the object is found", () => {
    const text = 'Sure, here is my answer:\n\n{"decision":"complete"}\n\nAnything else?'

    expect(extractJsonObject(text)).toEqual({ decision: "complete" })
  })

  test("#given stray prose braces before the real payload #when extracted #then the parseable object wins", () => {
    const text = 'Step {1} of {2}: {"decision":"noop"} done'

    expect(extractJsonObject(text)).toEqual({ decision: "noop" })
  })

  test("#given a nested object #when extracted #then depth tracking returns the whole value", () => {
    const text = 'prose {"outer":{"inner":{"n":1}},"tail":true} prose'

    expect(extractJsonObject(text)).toEqual({ outer: { inner: { n: 1 } }, tail: true })
  })

  test("#given braces inside a quoted string #when extracted #then they do not change depth", () => {
    const text = '{"title":"a { brace } inside","n":1}'

    expect(extractJsonObject(text)).toEqual({ title: "a { brace } inside", n: 1 })
  })

  test("#given an unbalanced brace inside a string #when extracted #then the object still closes correctly", () => {
    const text = '{"pattern":"{{{","ok":true}{"later":"unreached"}'

    expect(extractJsonObject(text)).toEqual({ pattern: "{{{", ok: true })
  })

  test("#given an escaped quote inside a string #when extracted #then it does not end the string early", () => {
    const text = '{"note":"he said \\"hi\\" loudly","ok":true}'

    expect(extractJsonObject(text)).toEqual({ note: 'he said "hi" loudly', ok: true })
  })

  test("#given an escaped quote before a brace inside a string #when extracted #then the brace stays inside the string", () => {
    const text = '{"p":"a\\"}","q":1}'

    expect(extractJsonObject(text)).toEqual({ p: 'a"}', q: 1 })
  })

  test("#given an escaped backslash before a quote #when extracted #then the string end is read correctly", () => {
    const text = '{"path":"C:\\\\","ok":true}'

    expect(extractJsonObject(text)).toEqual({ path: "C:\\", ok: true })
  })

  test("#given unbalanced braces in prose #when extracted #then null is returned rather than throwing", () => {
    expect(extractJsonObject("no structured answer here")).toBeNull()
    expect(extractJsonObject("{ not valid json }")).toBeNull()
    expect(extractJsonObject('text {"unterminated": 1 yes')).toBeNull()
  })

  test("#given only a non-object json literal #when extracted #then null is returned", () => {
    expect(extractJsonObject("the answer is [1,2,3]")).toBeNull()
    expect(extractJsonObject('the answer is {{"a":1')).toBeNull()
  })

  test("#given braces before an unparseable object and json after it #when extracted #then the scan continues past the failure", () => {
    const text = 'junk {oops}{"real":1}'

    expect(extractJsonObject(text)).toEqual({ real: 1 })
  })

  test("#given valid json following a truncated object #when extracted #then the first balanced span is tried and skipped", () => {
    const text = '{"broken": } and then {"good":true}'

    expect(extractJsonObject<{ good: boolean }>(text)).toEqual({ good: true })
  })

  test("#given an empty string #when extracted #then null is returned", () => {
    expect(extractJsonObject("")).toBeNull()
  })
})
