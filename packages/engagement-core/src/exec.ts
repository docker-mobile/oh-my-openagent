import { spawn } from "node:child_process"

/**
 * Typed execution boundary for security tooling. Every external tool invocation
 * goes through here, so arguments are validated and the exit status is always
 * captured rather than inferred from output text.
 *
 * Shape absorbed from pentagi `backend/pkg/tools/terminal.go` (MIT, pin
 * cffed9485a): an ExecOptions{cmd,cwd,detach,timeout} contract with a hard
 * timeout ceiling. See NOTICE.
 */

export interface ExecOptions {
  readonly cmd: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly timeoutMs?: number
  readonly env?: Record<string, string>
  readonly stdin?: string
}

export type ExecOutcome = "ok" | "failed" | "timeout" | "not-found"

export interface ExecResult {
  readonly outcome: ExecOutcome
  readonly command: string
  readonly argv: readonly string[]
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
}

export const MAX_EXEC_TIMEOUT_MS = 3 * 60 * 60 * 1000
export const DEFAULT_EXEC_TIMEOUT_MS = 5 * 60 * 1000
const OUTPUT_CAP_BYTES = 8 * 1024 * 1024

export class ExecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExecError"
  }
}

// A shell metacharacter in a command or argument would let a caller (or a model)
// escape the argv contract and run something else. Arguments are passed to argv
// verbatim, never through a shell, so this is a hard refusal.
const SHELL_META_RE = /[;&|`$><\n\r]/

export function assertNoShellMeta(value: string, what: string): void {
  if (SHELL_META_RE.test(value)) {
    throw new ExecError(`${what} contains a shell metacharacter: ${JSON.stringify(value)}`)
  }
}

/** An agent may never execute a command without a time bound. */
export function resolveTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined || timeoutMs <= 0) return DEFAULT_EXEC_TIMEOUT_MS
  return Math.min(timeoutMs, MAX_EXEC_TIMEOUT_MS)
}

export interface Runner {
  run(options: ExecOptions): Promise<ExecResult>
}

export function createSubprocessRunner(): Runner {
  return {
    async run(options: ExecOptions): Promise<ExecResult> {
      const { cmd, args = [], cwd, env, stdin } = options
      if (!cmd.trim()) throw new ExecError("cmd must not be empty")
      assertNoShellMeta(cmd, "cmd")
      for (const arg of args) assertNoShellMeta(arg, "argument")

      const started = Date.now()
      const timeoutMs = resolveTimeout(options.timeoutMs)

      return new Promise<ExecResult>((resolve) => {
        let settled = false
        const child = spawn(cmd, [...args], {
          cwd,
          env: { ...process.env, ...(env ?? {}) },
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        })

        let stdout = ""
        let stderr = ""

        const finish = (outcome: ExecOutcome, exitCode: number | null): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({
            outcome,
            command: cmd,
            argv: [cmd, ...args],
            exitCode,
            stdout,
            stderr,
            durationMs: Date.now() - started,
          })
        }

        const timer = setTimeout(() => {
          child.kill("SIGKILL")
          finish("timeout", null)
        }, timeoutMs)

        child.stdout?.on("data", (chunk: Buffer) => {
          if (stdout.length < OUTPUT_CAP_BYTES) stdout += chunk.toString("utf-8")
        })
        child.stderr?.on("data", (chunk: Buffer) => {
          if (stderr.length < OUTPUT_CAP_BYTES) stderr += chunk.toString("utf-8")
        })

        child.on("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") finish("not-found", null)
          else finish("failed", null)
        })

        child.on("close", (code) => {
          finish(code === 0 ? "ok" : "failed", code)
        })

        if (stdin !== undefined) child.stdin?.end(stdin)
        else child.stdin?.end()
      })
    },
  }
}

export interface AdapterDefinition {
  readonly name: string
  readonly binary: string
  readonly buildArgs: (target: string) => readonly string[]
}

export interface AdapterRunResult {
  readonly tool: string
  readonly target: string
  readonly result: ExecResult
}

/** Runs a tool through its declared argument builder, so no caller composes argv. */
export async function runAdapter(
  adapter: AdapterDefinition,
  target: string,
  runner: Runner,
  options: Omit<ExecOptions, "cmd" | "args"> = {},
): Promise<AdapterRunResult> {
  if (!target.trim()) throw new ExecError(`${adapter.name}: target must not be empty`)
  assertNoShellMeta(target, "target")

  const result = await runner.run({
    cmd: adapter.binary,
    args: adapter.buildArgs(target),
    ...options,
  })
  return { tool: adapter.name, target, result }
}
