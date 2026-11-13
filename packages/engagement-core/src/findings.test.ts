import { describe, expect, test } from "bun:test"

import {
  FindingError,
  FindingLedger,
  normalizeConfidence,
  normalizeCve,
  normalizeCwe,
  normalizeSeverity,
} from "./findings"

describe("finding severity and identity", () => {
  test("#given a severities set #when normalized #then only the known ranks are accepted", () => {
    expect(normalizeSeverity("CRITICAL")).toBe("critical")
    expect(normalizeSeverity(" High ")).toBe("high")
    expect(() => normalizeSeverity("catastrophic")).toThrow(FindingError)
    expect(() => normalizeSeverity("catastrophic")).toThrow(/critical, high, medium/)
  })

  test("#given a CVE id #when normalized #then it is canonicalized", () => {
    expect(normalizeCve("cve-2021-41773")).toBe("CVE-2021-41773")
    expect(normalizeCve(null)).toBeNull()
    expect(normalizeCve("")).toBeNull()
  })

  test("#given a malformed CVE id #when normalized #then it is refused", () => {
    expect(() => normalizeCve("CVE-21-1")).toThrow(/malformed CVE/)
    expect(() => normalizeCve("not-a-cve")).toThrow(FindingError)
  })

  test("#given a CWE id #when normalized #then it is canonicalized", () => {
    expect(normalizeCwe("cwe-79")).toBe("CWE-79")
    expect(() => normalizeCwe("CWE-")).toThrow(/malformed CWE/)
  })

  test("#given no stated confidence #when normalized #then it defaults to unverified", () => {
    expect(normalizeConfidence(undefined)).toBe("unverified")
    expect(normalizeConfidence("CONFIRMED")).toBe("confirmed")
    expect(() => normalizeConfidence("pretty-sure")).toThrow(FindingError)
  })
})

describe("finding ledger", () => {
  test("#given a finding without a target #when added #then it is refused", () => {
    const ledger = new FindingLedger()
    expect(() => ledger.add({ title: "x", severity: "high", target: "  " })).toThrow(/target/)
  })

  test("#given the same CVE on the same target twice #when added #then it dedupes", () => {
    const ledger = new FindingLedger()
    const first = ledger.add({ title: "path traversal", severity: "critical", cve: "CVE-2021-41773", target: "10.0.0.5" })
    const second = ledger.add({ title: "different wording", severity: "critical", cve: "CVE-2021-41773", target: "10.0.0.5" })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(ledger.all()).toHaveLength(1)
  })

  test("#given the same CVE on a different target #when added #then both are kept", () => {
    const ledger = new FindingLedger()
    ledger.add({ title: "traversal", severity: "high", cve: "CVE-2021-41773", target: "10.0.0.5" })
    ledger.add({ title: "traversal", severity: "high", cve: "CVE-2021-41773", target: "10.0.0.6" })

    expect(ledger.all()).toHaveLength(2)
  })

  test("#given findings of mixed severity #when ranked #then critical leads and order is stable", () => {
    const ledger = new FindingLedger()
    ledger.add({ title: "info leak", severity: "info", target: "t" })
    ledger.add({ title: "rce", severity: "critical", target: "t" })
    ledger.add({ title: "xss", severity: "medium", target: "t" })

    expect(ledger.ranked().map((f) => f.severity)).toEqual(["critical", "medium", "info"])
  })

  test("#given findings of several severities #when counted #then every severity is reported", () => {
    const ledger = new FindingLedger()
    ledger.add({ title: "a", severity: "high", target: "t1" })
    ledger.add({ title: "b", severity: "high", target: "t2" })
    ledger.add({ title: "c", severity: "low", target: "t3" })

    const counts = ledger.countBySeverity()
    expect(counts.high).toBe(2)
    expect(counts.low).toBe(1)
    expect(counts.critical).toBe(0)
  })

  test("#given a finding with no evidence #when checked #then it is reported as unproven", () => {
    const ledger = new FindingLedger()
    ledger.add({ title: "claimed rce", severity: "critical", target: "t" })
    ledger.add({
      title: "proven xss",
      severity: "medium",
      target: "t",
      evidence: [{ tool: "nuclei", command: ["nuclei", "-u", "http://t"], output: "matched" }],
    })

    expect(ledger.unproven().map((f) => f.title)).toEqual(["claimed rce"])
  })

  test("#given evidence #when recorded #then the command and tool are preserved verbatim", () => {
    const ledger = new FindingLedger()
    const { finding } = ledger.add({
      title: "verified",
      severity: "high",
      target: "10.0.0.5",
      evidence: [{ tool: "nmap", command: ["nmap", "-sV", "10.0.0.5"], output: "80/tcp open" }],
    })

    expect(finding.evidence[0]?.tool).toBe("nmap")
    expect(finding.evidence[0]?.command).toEqual(["nmap", "-sV", "10.0.0.5"])
    expect(finding.evidence[0]?.capturedAt).toMatch(/Z$/)
  })

  test("#given a ledger #when exported as json #then the payload parses and carries the findings", () => {
    const ledger = new FindingLedger()
    ledger.add({ title: "one", severity: "low", target: "t" })

    const parsed = JSON.parse(ledger.toJson()) as { findings: unknown[] }
    expect(parsed.findings).toHaveLength(1)
  })
})
