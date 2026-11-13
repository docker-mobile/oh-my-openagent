# tmux-core — Tmux Primitives (Core)

**Generated:** 2026-06-16

## OVERVIEW

Harness-neutral tmux primitives consumed by the OpenCode adapter (`omc-opencode`), team-mode visualization (`team-core`), OpenClaw injection (`openclaw-core`), and the `interactive_bash` tool. Every function is dependency-injected so adapters supply `getTmuxPath()`, `log`, and server-health checks. Package: `@oh-my-cybersecurity/tmux-core`.

## CATEGORY MAP

| Area | Key Files | Key Exports |
|------|-----------|-------------|
| **Runner** | `src/runner.ts` | `runTmuxCommand()`, `TmuxCommandResult` — retry, timeout, cmux compat |
| **Pane auth** | `src/pane-auth.ts` | Paned auth resolution, publicly re-exported from the barrel |
| **Types / Config** | `src/types.ts`, `src/constants.ts` | `TmuxConfig`, `TmuxLayout`, `TmuxIsolation`, `SpawnPaneResult`, polling constants |
| **Pane Lifecycle** | `src/tmux-utils/pane-spawn.ts`, `pane-close.ts`, `pane-replace.ts`, `pane-activate.ts`, `pane-command.ts`, `spawn-process.ts` | `spawnTmuxPane()`, `closeTmuxPane()`, `replaceTmuxPane()`, `activateTmuxPane()`, `buildTmuxAttachCommand()`, `buildTmuxPlaceholderCommand()` |
| **Session Lifecycle** | `src/tmux-utils/session-spawn.ts`, `session-kill.ts`, `stale-session-sweep.ts` | `spawnTmuxSession()`, `killTmuxSessionIfExists()`, `sweepStaleOmoAgentSessions()` |
| **Window / Layout** | `src/tmux-utils/window-spawn.ts`, `layout.ts`, `pane-dimensions.ts` | `spawnTmuxWindow()`, `applyLayout()`, `enforceMainPaneWidth()`, `getPaneDimensions()` |
| **Environment / Health** | `src/tmux-utils/environment.ts`, `server-health.ts`, `src/cmux-detect.ts` | `isInsideTmux()`, `getCurrentPaneId()`, `isServerRunning()`, `isCmuxCompatEnvironment()` |

## FLOW

```
spawnTmuxPane / spawnTmuxSession / spawnTmuxWindow
  ├─ guard: config.enabled
  ├─ guard: isInsideTmux()
  ├─ guard: isServerRunning(serverUrl)
  ├─ resolve tmux binary (or cmux compat shim)
  └─ tmux split-window / new-session / new-window + placeholder command
```

## NOTES

- **Cmux compatibility:** `cmux-detect.ts` redirects tmux commands to `cmux __tmux-compat` when `CMUX_SOCKET_PATH` or `cmuxterm` is detected.
- **Isolation levels:** `TmuxIsolation` (`inline`, `window`, `session`) controls whether subagent panes split inline, spawn a named window (`omc-agents`), or an isolated session (`omc-agents-<pid>`).
- **Adapter shim pattern:** `omc-opencode/src/shared/tmux/` re-exports `runTmuxCommand` and wires `getTmuxPath` from `interactive-bash/tmux-path-resolver` into DI deps (`adapter-deps.ts`). `team-core` consumes the same primitives directly for team-mode tmux layouts. Note: `src/tmux-utils/index.ts` exports only `killTmuxSessionIfExists`; the pane/session helpers are imported from their individual files, not the dir barrel.
- **Stale session sweep:** `stale-session-sweep.ts` matches `omc-agents-<pid>` sessions, skips the current PID, and kills sessions whose owner process is dead.

Parent: [packages/AGENTS.md](../AGENTS.md)
