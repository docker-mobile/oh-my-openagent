/**
 * Typed finding model: severity, CVE identity, and the evidence that backs a
 * claim. Neither upstream shipped this - sapper keeps findings as prose in a
 * `vuln` fact's `doc`, and pentagi's harvest states outright that it "has no
 * typed finding, no CVE id, no CVSS score" and that a port must invent one.
 *
 * Vocabulary for the classification unions follows the security taxonomy used
 * by pentagi's Graphiti node/edge prompts (MIT, pin cffed9485a). See NOTICE.
 */

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const
export type Severity = (typeof SEVERITIES)[number]

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
}

export const CONFIDENCES = ["confirmed", "likely", "unverified"] as const
export type Confidence = (typeof CONFIDENCES)[number]

export class FindingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FindingError"
  }
}

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/
const CWE_RE = /^CWE-\d{1,5}$/

export interface Evidence {
  readonly tool: string
  readonly command: readonly string[]
  readonly output: string
  readonly capturedAt: string
}

export interface Finding {
  readonly id: string
  readonly title: string
  readonly severity: Severity
  readonly confidence: Confidence
  readonly cve: string | null
  readonly cwe: string | null
  readonly target: string
  readonly endpoint: string | null
  readonly evidence: readonly Evidence[]
  readonly remediation: string | null
}

export interface FindingInput {
  readonly title: string
  readonly severity: string
  readonly confidence?: string
  readonly cve?: string | null
  readonly cwe?: string | null
  readonly target: string
  readonly endpoint?: string | null
  readonly evidence?: readonly Omit<Evidence, "capturedAt">[]
  readonly remediation?: string | null
}

export function normalizeSeverity(severity: string): Severity {
  const canonical = severity.trim().toLowerCase()
  if (!(SEVERITIES as readonly string[]).includes(canonical)) {
    throw new FindingError(
      `unknown severity ${JSON.stringify(severity)}; expected one of: ${SEVERITIES.join(", ")}`,
    )
  }
  return canonical as Severity
}

export function normalizeConfidence(confidence: string | undefined): Confidence {
  if (confidence === undefined) return "unverified"
  const canonical = confidence.trim().toLowerCase()
  if (!(CONFIDENCES as readonly string[]).includes(canonical)) {
    throw new FindingError(
      `unknown confidence ${JSON.stringify(confidence)}; expected one of: ${CONFIDENCES.join(", ")}`,
    )
  }
  return canonical as Confidence
}

export function normalizeCve(cve: string | null | undefined): string | null {
  if (cve === null || cve === undefined || !cve.trim()) return null
  const canonical = cve.trim().toUpperCase()
  if (!CVE_RE.test(canonical)) {
    throw new FindingError(`malformed CVE id ${JSON.stringify(cve)}; expected CVE-YYYY-NNNN`)
  }
  return canonical
}

export function normalizeCwe(cwe: string | null | undefined): string | null {
  if (cwe === null || cwe === undefined || !cwe.trim()) return null
  const canonical = cwe.trim().toUpperCase()
  if (!CWE_RE.test(canonical)) {
    throw new FindingError(`malformed CWE id ${JSON.stringify(cwe)}; expected CWE-NNN`)
  }
  return canonical
}

/**
 * A capped, deduplicated finding ledger. Dedupe is on (cve | title) + target, so
 * a repeated scan run does not inflate the report.
 */
export class FindingLedger {
  private readonly items = new Map<string, Finding>()
  private counter = 0

  private keyOf(title: string, cve: string | null, target: string): string {
    return `${cve ?? title.toLowerCase()}::${target.toLowerCase()}`
  }

  add(input: FindingInput): { finding: Finding; duplicate: boolean } {
    if (!input.title.trim()) throw new FindingError("a finding needs a title")
    if (!input.target.trim()) throw new FindingError("a finding needs a target")

    const cve = normalizeCve(input.cve)
    const key = this.keyOf(input.title, cve, input.target)
    const existing = this.items.get(key)
    if (existing) return { finding: existing, duplicate: true }

    this.counter += 1
    const finding: Finding = {
      id: `v${String(this.counter).padStart(3, "0")}`,
      title: input.title.trim(),
      severity: normalizeSeverity(input.severity),
      confidence: normalizeConfidence(input.confidence),
      cve,
      cwe: normalizeCwe(input.cwe),
      target: input.target.trim(),
      endpoint: input.endpoint?.trim() || null,
      evidence: (input.evidence ?? []).map((e) => ({
        tool: e.tool,
        command: [...e.command],
        output: e.output,
        capturedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      })),
      remediation: input.remediation?.trim() || null,
    }

    this.items.set(key, finding)
    return { finding, duplicate: false }
  }

  all(): readonly Finding[] {
    return [...this.items.values()]
  }

  get(id: string): Finding | undefined {
    return [...this.items.values()].find((f) => f.id === id)
  }

  /** Highest severity first, then by id so the order is stable across runs. */
  ranked(): readonly Finding[] {
    return [...this.items.values()].sort((a, b) => {
      const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      return bySeverity !== 0 ? bySeverity : a.id.localeCompare(b.id)
    })
  }

  countBySeverity(): Record<Severity, number> {
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>
    for (const finding of this.items.values()) counts[finding.severity] += 1
    return counts
  }

  /**
   * A finding with no evidence is a claim, not a confirmed result, so it is
   * reported as unproven rather than silently counted.
   */
  unproven(): readonly Finding[] {
    return [...this.items.values()].filter((f) => f.evidence.length === 0)
  }

  toJson(): string {
    return JSON.stringify({ findings: this.ranked() }, null, 2)
  }
}
