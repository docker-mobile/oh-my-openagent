/**
 * Recon orchestration: drives declared adapters across targets through the exec
 * boundary, turns their output into recorded facts and findings, and reports
 * what actually ran. A tool that is absent is reported as skipped, never as a
 * clean scan - a fake negative is worse than a known gap.
 *
 * Neither upstream orchestrates adapters: sapper's agent shells out itself and
 * pentagi's model composes shell strings. This pipeline is new work; see
 * PARITY.md.
 */

import type { FindingLedger, FindingInput, Severity } from "./findings"
import type { ExecResult, Runner } from "./exec"
import type { EngagementStore } from "./store"
import { scanForInjection, type InjectionReport } from "./untrusted"

export interface ReconTarget {
  readonly host: string
  readonly ports?: readonly number[]
}

export interface ReconStep {
  readonly adapter: string
  readonly target: string
  readonly status: "ran" | "absent" | "failed" | "timeout" | "refused"
  readonly exitCode: number | null
  readonly durationMs: number
  readonly stdout: string
  readonly reason: string | null
}

export interface ReconReport {
  readonly steps: readonly ReconStep[]
  readonly findings: readonly FindingInput[]
  readonly injections: readonly InjectionReport[]
}

export interface ReconPlanEntry {
  readonly adapterName: string
  readonly binary: string
  readonly buildArgs: (target: string) => readonly string[]
  readonly detect: (result: ExecResult) => readonly FindingInput[]
}

export interface ReconOptions {
  readonly runner: Runner
  readonly store?: EngagementStore
  readonly timeoutMs?: number
  readonly onStep?: (step: ReconStep) => void
}

const OPEN_PORT_RE = /^(\d{1,5})\/(tcp|udp)\s+open\s+(\S+)?/gim

function parseOpenPorts(stdout: string): { port: number; proto: string; product: string | null }[] {
  const out: { port: number; proto: string; product: string | null }[] = []
  for (const match of stdout.matchAll(OPEN_PORT_RE)) {
    const port = Number(match[1])
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue
    out.push({ port, proto: (match[2] ?? "tcp").toLowerCase(), product: match[3] ?? null })
  }
  return out
}

/** Default detection: an open port becomes a service finding on the target. */
export function detectOpenPorts(target: string): (result: ExecResult) => readonly FindingInput[] {
  return (result) =>
    parseOpenPorts(result.stdout).map((svc) => ({
      title: `open ${svc.proto}/${svc.port}${svc.product ? ` (${svc.product})` : ""}`,
      severity: "info" as Severity,
      confidence: "confirmed" as const,
      target,
      endpoint: `${target}:${svc.port}`,
      evidence: [
        {
          tool: "recon",
          command: result.argv,
          output: result.stdout.slice(0, 4096),
        },
      ],
    }))
}

/**
 * Runs each plan entry against each target. Targets are the only untrusted input
 * here, so the exec boundary refuses any that carries shell syntax rather than
 * letting it reach a spawn.
 */
export async function runRecon(
  plan: readonly ReconPlanEntry[],
  targets: readonly ReconTarget[],
  options: ReconOptions,
): Promise<ReconReport> {
  const steps: ReconStep[] = []
  const findings: FindingInput[] = []
  const injections: InjectionReport[] = []

  for (const target of targets) {
    for (const entry of plan) {
      let args: readonly string[]
      try {
        args = entry.buildArgs(target.host)
      } catch (error) {
        const step: ReconStep = {
          adapter: entry.adapterName,
          target: target.host,
          status: "refused",
          exitCode: null,
          durationMs: 0,
          stdout: "",
          reason: error instanceof Error ? error.message : String(error),
        }
        steps.push(step)
        options.onStep?.(step)
        continue
      }

      let result: ExecResult
      try {
        result = await options.runner.run({
          cmd: entry.binary,
          args: [...args],
          timeoutMs: options.timeoutMs,
        })
      } catch (error) {
        const step: ReconStep = {
          adapter: entry.adapterName,
          target: target.host,
          status: "refused",
          exitCode: null,
          durationMs: 0,
          stdout: "",
          reason: error instanceof Error ? error.message : String(error),
        }
        steps.push(step)
        options.onStep?.(step)
        continue
      }

      const status: ReconStep["status"] =
        result.outcome === "not-found"
          ? "absent"
          : result.outcome === "timeout"
            ? "timeout"
            : result.outcome === "ok"
              ? "ran"
              : "failed"

      const injection = scanForInjection(result.stdout, `${entry.adapterName}:${target.host}`)
      if (injection.detected) injections.push(injection)

      const detected = status === "ran" ? entry.detect(result) : []
      findings.push(...detected)

      if (options.store) {
        options.store.addFact({
          title: `${entry.adapterName} on ${target.host}: ${status}`,
          kind: "note",
          data: { adapter: entry.adapterName, target: target.host, status, exit: result.exitCode ?? "none" },
        })
      }

      const step: ReconStep = {
        adapter: entry.adapterName,
        target: target.host,
        status,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdout: result.stdout,
        reason:
          status === "absent"
            ? `${entry.binary} is not installed; nothing was scanned`
            : status === "ran" && detected.length === 0
              ? "ran clean; no finding produced"
              : null,
      }
      steps.push(step)
      options.onStep?.(step)
    }
  }

  return { steps, findings, injections }
}

export interface ReconSummary {
  readonly ran: number
  readonly absent: number
  readonly failed: number
  readonly findings: number
  readonly unproven: boolean
}

/** `unproven` is true when nothing actually ran, so an all-absent sweep cannot read as success. */
export function summarizeRecon(report: ReconReport): ReconSummary {
  const ran = report.steps.filter((s) => s.status === "ran").length
  return {
    ran,
    absent: report.steps.filter((s) => s.status === "absent").length,
    failed: report.steps.filter((s) => s.status === "failed" || s.status === "timeout").length,
    findings: report.findings.length,
    unproven: ran === 0,
  }
}

export function recordFindings(ledger: FindingLedger, report: ReconReport): number {
  let added = 0
  for (const finding of report.findings) {
    const { duplicate } = ledger.add(finding)
    if (!duplicate) added += 1
  }
  return added
}
