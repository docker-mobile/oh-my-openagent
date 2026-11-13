import type { AtomicTest, ExecutorType, InputArgument, ResolvedCommand } from "./types"

// A `#{...}` token is a placeholder only when it names a declared argument: any
// other token is payload (quote-heavy shell and PowerShell lines look identical),
// so it survives verbatim and is deliberately not reported as unresolved.
const PLACEHOLDER_TOKEN = /#\{([^}]*)\}/g

export interface TemplateResolution {
  readonly text: string
  readonly unresolved: readonly string[]
}

export interface ExecutorDispatch {
  readonly binary: string
  readonly args: readonly string[]
}

export interface DependencyPreflight {
  readonly description: string
  readonly executor: ExecutorType
  readonly prereqCommand: string
  readonly getPrereqCommand: string | null
  readonly unresolved: readonly string[]
}

interface DispatchEntry {
  readonly binary: string
  readonly flag: string
}

const PLATFORM_SHELL_BINARY = process.platform === "win32" ? "cmd.exe" : "/bin/sh"

const DISPATCH_TABLE: Readonly<Record<ExecutorType, DispatchEntry | null>> = {
  command: { binary: PLATFORM_SHELL_BINARY, flag: "-c" },
  sh: { binary: "/bin/sh", flag: "-c" },
  bash: { binary: "/bin/bash", flag: "-c" },
  powershell: { binary: "pwsh", flag: "-Command" },
  pwsh: { binary: "pwsh", flag: "-Command" },
  python: { binary: "python3", flag: "-c" },
  manual: null,
}

// Single-pass by construction: replacement text is appended to the output and
// never rescanned, so a default that itself contains a token stays as authored.
export function resolveTemplate(
  template: string,
  inputArguments: Readonly<Record<string, InputArgument>>,
  overrides: Readonly<Record<string, string>>,
): TemplateResolution {
  const unresolved: string[] = []
  let text = ""
  let cursor = 0

  for (const match of template.matchAll(PLACEHOLDER_TOKEN)) {
    const key = match[1] ?? ""
    const token = match[0]
    text += template.slice(cursor, match.index)
    cursor = match.index + token.length

    const argument = Object.hasOwn(inputArguments, key) ? inputArguments[key] : undefined
    if (argument === undefined) {
      text += token
      continue
    }

    const override = Object.hasOwn(overrides, key) ? overrides[key] : undefined
    const replacement = override === undefined ? argument.default : override
    if (replacement === null || replacement === undefined) {
      if (!unresolved.includes(key)) {
        unresolved.push(key)
      }
      text += token
      continue
    }

    text += replacement
  }

  text += template.slice(cursor)
  return { text, unresolved }
}

export function resolveCommand(
  test: AtomicTest,
  overrides: Readonly<Record<string, string>> = {},
): ResolvedCommand {
  const resolved = resolveTemplate(test.executor.command, test.arguments, overrides)
  return { command: resolved.text, unresolved: resolved.unresolved, executor: test.executor.name }
}

export function isRunnable(test: AtomicTest): boolean {
  if (test.manual) {
    return false
  }
  return resolveCommand(test).command.trim().length > 0
}

export function buildDispatch(test: AtomicTest, resolved: ResolvedCommand): ExecutorDispatch | null {
  const entry = DISPATCH_TABLE[test.executor.name]
  if (entry === null) {
    return null
  }
  return { binary: entry.binary, args: [entry.flag, resolved.command] }
}

export function preflightPlan(
  test: AtomicTest,
  overrides: Readonly<Record<string, string>> = {},
): readonly DependencyPreflight[] {
  return test.dependencies.map((dependency) => {
    const prereq = resolveTemplate(dependency.prereqCommand, test.arguments, overrides)
    const getPrereq =
      dependency.getPrereqCommand === null
        ? null
        : resolveTemplate(dependency.getPrereqCommand, test.arguments, overrides)

    const unresolved = [...prereq.unresolved]
    if (getPrereq !== null) {
      for (const key of getPrereq.unresolved) {
        if (!unresolved.includes(key)) {
          unresolved.push(key)
        }
      }
    }

    return {
      description: dependency.description,
      executor: dependency.executor,
      prereqCommand: prereq.text,
      getPrereqCommand: getPrereq === null ? null : getPrereq.text,
      unresolved,
    }
  })
}
