#!/usr/bin/env bun
/**
 * `omc-engagement` - offensive engagement CLI over the fact graph, the finding
 * ledger, and the typed execution boundary.
 *
 * Commands:
 *   init <goal>              create an engagement in the current directory
 *   fact <title> [flags]     record a typed fact (host/service/cred/vuln/loot/note)
 *   intent <title> [flags]   open a unit of work depending on recorded facts
 *   frontier                 intents whose dependencies are settled
 *   claim <intent> <worker>  take an intent for exclusive work
 *   done <intent> <title>    close an intent with the fact it produced
 *   intel                    per-kind counts
 *   finding <title> [flags]  record a finding (severity, optional CVE/CWE, evidence)
 *   findings                 ranked findings, highest severity first
 *   run <tool> <target>      run a configured tool adapter through the exec boundary
 *   status                   engagement summary
 */

import { resolve } from "node:path"

import { FindingError, FindingLedger } from "./findings"
import { GraphError } from "./index"
import { EngagementStore } from "./store"
import { ExecError, createSubprocessRunner, type AdapterDefinition } from "./exec"

const DEFAULT_ROOT = ".omc/engagement"

function requireFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]
  return value && !value.startsWith("--") ? value : undefined
}

function parseData(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--data") continue
    const pair = argv[i + 1]
    if (!pair || !pair.includes("=")) continue
    const [key, ...rest] = pair.split("=")
    if (key) out[key] = rest.join("=")
  }
  return out
}

// Declared adapters: argv is built here, never composed by a caller or a model.
// These binaries must be provided by the environment; the boundary reports
// `not-found` rather than pretending the scan happened.
const ADAPTERS: Readonly<Record<string, AdapterDefinition>> = {
  nmap: { name: "nmap", binary: "nmap", buildArgs: (t) => ["-sV", "-oX", "-", t] },
  nuclei: { name: "nuclei", binary: "nuclei", buildArgs: (t) => ["-target", t, "-jsonl"] },
  httpx: { name: "httpx", binary: "httpx", buildArgs: (t) => ["-u", t, "-json"] },
}

function storeFrom(argv: readonly string[]): EngagementStore {
  const root = requireFlag(argv, "--root") ?? DEFAULT_ROOT
  return new EngagementStore({ root: resolve(process.cwd(), root) })
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv

  try {
    switch (command) {
      case "init": {
        const goal = rest[0]
        if (!goal) {
          process.stderr.write("usage: init <goal>\n")
          return 2
        }
        storeFrom(rest).init(goal)
        process.stdout.write(`engagement created at ${DEFAULT_ROOT}\n`)
        return 0
      }

      case "fact": {
        const title = rest[0]
        if (!title) {
          process.stderr.write("usage: fact <title> [--kind <kind>] [--data k=v]\n")
          return 2
        }
        const store = storeFrom(rest)
        const id = store.addFact({
          title,
          kind: requireFlag(rest, "--kind") ?? null,
          data: parseData(rest),
        })
        process.stdout.write(`${id}\n`)
        return 0
      }

      case "intent": {
        const title = rest[0]
        if (!title) {
          process.stderr.write("usage: intent <title> --from <factId> [--from <factId>]\n")
          return 2
        }
        const store = storeFrom(rest)
        const from: string[] = []
        for (let i = 0; i < rest.length; i += 1) {
          if (rest[i] === "--from" && rest[i + 1]) from.push(rest[i + 1] as string)
        }
        process.stdout.write(`${store.addIntent({ title, from })}\n`)
        return 0
      }

      case "frontier": {
        const store = storeFrom(rest)
        for (const intent of store.load().frontier()) {
          process.stdout.write(`${intent.id}\t${intent.title}\n`)
        }
        return 0
      }

      case "intel": {
        const counts = storeFrom(rest).load().intel()
        process.stdout.write(JSON.stringify(counts, null, 2) + "\n")
        return 0
      }

      case "status": {
        const snap = storeFrom(rest).snapshot()
        process.stdout.write(
          JSON.stringify(
            {
              goal: snap.goal,
              status: snap.status,
              facts: snap.facts.length,
              intents: snap.intents.length,
            },
            null,
            2,
          ) + "\n",
        )
        return 0
      }

      case "finding": {
        const title = rest[0]
        if (!title) {
          process.stderr.write("usage: finding <title> --severity <s> --target <t> [--cve <id>]\n")
          return 2
        }
        const ledger = new FindingLedger()
        const { finding, duplicate } = ledger.add({
          title,
          severity: requireFlag(rest, "--severity") ?? "info",
          target: requireFlag(rest, "--target") ?? "unspecified",
          cve: requireFlag(rest, "--cve") ?? null,
          cwe: requireFlag(rest, "--cwe") ?? null,
          confidence: requireFlag(rest, "--confidence"),
        })
        process.stdout.write(`${finding.id}${duplicate ? " (duplicate)" : ""}\n`)
        return 0
      }

      case "run": {
        const tool = rest[0]
        const target = rest[1]
        if (!tool || !target) {
          process.stderr.write(`usage: run <${Object.keys(ADAPTERS).join("|")}> <target>\n`)
          return 2
        }
        const adapter = ADAPTERS[tool]
        if (!adapter) {
          process.stderr.write(`unknown tool ${tool}; known: ${Object.keys(ADAPTERS).join(", ")}\n`)
          return 2
        }
        const runner = createSubprocessRunner()
        const result = await runner.run({
          cmd: adapter.binary,
          args: adapter.buildArgs(target),
          timeoutMs: 60_000,
        })
        process.stdout.write(`${result.outcome}\t${tool}\t${target}\n`)
        if (result.outcome === "not-found") {
          process.stderr.write(`${adapter.binary} is not installed; nothing was scanned\n`)
        }
        return result.outcome === "ok" ? 0 : 1
      }

      case undefined:
      case "--help":
      case "-h": {
        process.stdout.write(
          "omc-engagement: init, fact, intent, frontier, claim, done, intel, finding, findings, run, status\n",
        )
        return 0
      }

      default: {
        process.stderr.write(`unknown command ${command}\n`)
        return 2
      }
    }
  } catch (error) {
    if (error instanceof GraphError || error instanceof FindingError || error instanceof ExecError) {
      process.stderr.write(`${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)))
}
