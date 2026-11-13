import type { OffensiveAction, OffensivePrimitive, PrimitiveCommand, PrimitiveQuery } from "./types"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

// Best-first offensive value tiers: escalation and loot, then stealth, then the
// code-execution family, then plain foothold value. Ties break by id.
const ACTION_TIER: Readonly<Record<OffensiveAction, number>> = {
  "privilege-escalation": 0,
  "credential-access": 0,
  "defense-evasion": 1,
  "uac-bypass": 1,
  execute: 2,
  shell: 2,
  "reverse-shell": 2,
  "bind-shell": 2,
  injection: 2,
  persistence: 2,
  "lateral-movement": 2,
  recon: 3,
  "file-read": 3,
  "file-write": 3,
  upload: 3,
  download: 3,
}

const UNRANKED_TIER = 4

// Shell metacharacters only: a bare parenthesis is payload syntax for the abused
// binary, not shell syntax, so it must not disqualify a command without a shell.
const SHELL_SYNTAX = /[|&;<>`\n]|\$\(/
const TTY_SYNTAX = /\$\(tty\)|\/dev\/tty/

const UNPRIVILEGED_TOKEN = /unprivileged|low privileges|no privileges|user|any/
const ELEVATED_TOKEN = /sudo|suid|setuid|root|admin|administrator|system|backup|privilege/

export interface ArsenalRankState {
  readonly privilege: "user" | "sudo" | "root" | "suid" | "system"
  readonly platform: "linux" | "macos" | "unix" | "windows"
  readonly tty: boolean
  readonly hasShell: boolean
}

function compareById(left: OffensivePrimitive, right: OffensivePrimitive): number {
  if (left.id === right.id) {
    return 0
  }
  return left.id < right.id ? -1 : 1
}

function matchesText(primitive: OffensivePrimitive, needle: string): boolean {
  return (
    primitive.name.toLowerCase().includes(needle) ||
    primitive.description.toLowerCase().includes(needle) ||
    primitive.binary.toLowerCase().includes(needle) ||
    primitive.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
    primitive.commands.some((command) => command.code.toLowerCase().includes(needle))
  )
}

function matchesQuery(primitive: OffensivePrimitive, query: PrimitiveQuery): boolean {
  if (query.action !== undefined && !primitive.actions.includes(query.action)) {
    return false
  }
  if (query.platform !== undefined && !primitive.platform.includes(query.platform)) {
    return false
  }
  if (query.binary !== undefined && primitive.binary !== query.binary) {
    return false
  }
  if (query.mitre !== undefined && !primitive.mitre.includes(query.mitre)) {
    return false
  }
  if (query.source !== undefined && primitive.source !== query.source) {
    return false
  }
  if (query.text !== undefined && !matchesText(primitive, query.text.toLowerCase())) {
    return false
  }
  return true
}

function resolveLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }
  return Math.min(Math.max(Math.floor(limit), 0), MAX_LIMIT)
}

export function searchPrimitives(
  primitives: readonly OffensivePrimitive[],
  query: PrimitiveQuery,
): OffensivePrimitive[] {
  const matched = primitives.filter((primitive) => matchesQuery(primitive, query))
  // Canonical id ordering: the result is a pure function of the matched set, not of
  // the caller's array order, and `limit` therefore always trims the same tail.
  const ordered = matched.toSorted(compareById)
  return ordered.slice(0, resolveLimit(query.limit))
}

function privilegeTokens(privileges: string): string[] {
  return privileges
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)
}

function tokenRequiresElevation(token: string): boolean {
  if (UNPRIVILEGED_TOKEN.test(token)) {
    return false
  }
  return ELEVATED_TOKEN.test(token)
}

// A comma-joined `privileges` value lists every context a command works in
// (gtfobins `unprivileged,sudo,suid`, lolbas `User, Administrator in Windows 8`),
// so it needs elevation only when every listed context does.
function requiresElevation(privileges: string): boolean {
  const tokens = privilegeTokens(privileges)
  if (tokens.length === 0) {
    return false
  }
  return tokens.every(tokenRequiresElevation)
}

function carriesPrivilegeToken(privileges: string, token: string): boolean {
  return privilegeTokens(privileges).includes(token)
}

function commandUsableAt(command: PrimitiveCommand, state: ArsenalRankState): boolean {
  if (!requiresElevation(command.privileges)) {
    return true
  }
  if (state.privilege === "root" || state.privilege === "system") {
    return true
  }
  if (state.privilege === "sudo") {
    return carriesPrivilegeToken(command.privileges, "sudo")
  }
  return state.privilege === "suid" && carriesPrivilegeToken(command.privileges, "suid")
}

function commandNeedsTty(command: PrimitiveCommand): boolean {
  return command.variant?.endsWith("-tty") === true || TTY_SYNTAX.test(command.code)
}

function isCommandUsableForState(command: PrimitiveCommand, state: ArsenalRankState): boolean {
  if (!commandUsableAt(command, state)) {
    return false
  }
  if (!state.tty && commandNeedsTty(command)) {
    return false
  }
  return state.hasShell || !SHELL_SYNTAX.test(command.code)
}

function isUsableForState(primitive: OffensivePrimitive, state: ArsenalRankState): boolean {
  if (!primitive.platform.includes(state.platform)) {
    return false
  }
  // A primitive carrying no command is kept: nothing in it proves unusable.
  return primitive.commands.every((command) => isCommandUsableForState(command, state))
}

function tierOf(primitive: OffensivePrimitive): number {
  if (primitive.actions.length === 0) {
    return UNRANKED_TIER
  }
  return Math.min(...primitive.actions.map((action) => ACTION_TIER[action]))
}

function compareByTier(left: OffensivePrimitive, right: OffensivePrimitive): number {
  return tierOf(left) - tierOf(right) || compareById(left, right)
}

export function rankForState(
  state: ArsenalRankState,
  primitives: readonly OffensivePrimitive[],
): OffensivePrimitive[] {
  return primitives.filter((primitive) => isUsableForState(primitive, state)).toSorted(compareByTier)
}
