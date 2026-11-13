# packages/ - Monorepo Packages

**Generated:** 2026-08-24 / f3642fcda

## OVERVIEW

51 sibling packages across 7 roles. `omc-opencode` is the **build entry** for the main npm dist (`packages/omc-opencode/src/index.ts` → bundled into root `dist/`). The root `package.json` `files` array ships `dist/` + `bin/` + `postinstall.mjs` plus selected sibling artifacts (`lsp-tools-mcp`, `lsp-daemon`, `git-bash-mcp` `dist/`; `shared-skills`; the `omc-codex` plugin bundle; and `.opencode`/`.agents` command+skill dirs). Everything else is a sibling with its own package boundary; check the package docs before assuming a publication, deployment, or local-install surface.

## ROLE MAP

| Role | Count | Packages |
|------|-------|----------|
| **Platform launcher packages** | 12 | One per (OS × arch × variant). Uniform layout: `bin/` + `package.json` only. Selected at install time by `bin/` shim + `postinstall.mjs`. |
| **MCP packages** | 4 | `lsp-tools-mcp`, `git-bash-mcp`, `lsp-daemon`, `ast-grep-mcp` |
| **Core packages** | 20 | `utils`, `model-core`, `prompts-core`, `rules-engine` (was `rules-core`), `agents-md-core`, `comment-checker-core`, `hashline-core`, `boulder-state`, `telemetry-core`, `lsp-core`, `mcp-stdio-core`, `tmux-core`, `claude-code-compat-core`, `skills-loader-core`, `mcp-client-core`, `openclaw-core`, `team-core`, `delegate-core`, `omc-config-core`, `memory-core` |
| **Adapters** | 3 (+2 adapter-support) | `omc-opencode` (OpenCode Ultimate edition; the former root `src/`, build entry for the main npm dist) + `omc-codex` (Codex CLI Light edition; live npm alias `lazycodex-ai`, repository/bin identity `lazycodex`; Codex marketplace `sisyphuslabs` / plugin `omc`) + `omc-senpi` (Senpi native TypeScript extension adapter; local-path Pi package under `packages/omc-senpi/plugin`). Adapter-support: `senpi-task` (Senpi-coupled task engine consumed only by `omc-senpi`; not harness-neutral, so not a `*-core` package) + `omc-native` (npm `omc-ai` distribution launcher staging the `omc-senpi` plugin payload). See [`packages/omc-opencode/src/AGENTS.md`](omc-opencode/src/AGENTS.md), [`packages/omc-codex/AGENTS.md`](omc-codex/AGENTS.md), [`packages/omc-senpi/AGENTS.md`](omc-senpi/AGENTS.md), [`packages/senpi-task/AGENTS.md`](senpi-task/AGENTS.md) |
| **Skills** | 1 | [`shared-skills`](shared-skills/AGENTS.md) (cross-harness SKILL.md bundle shared between OMO and Codex; shipped via root `files` array) |
| **Web** | 1 | `web` |
| **Desktop (TS side)** | 6 | The TypeScript half of the senpi desktop stack whose Rust half is [`crates/`](../crates/AGENTS.md): `senpi-desktop-protocol` (engine JSON-RPC types, snapshot, error codes, computer-call approval), `senpi-desktop-engine` (locator, ABI handshake, dev-build fallback for the Rust binary), `senpi-desktop-service` (JSON-RPC client over the engine child process + `computer.run`), `senpi-desktop-tool` (the `computer` tool definition, permission tiers, `/computer` command), `senpi-desktop-prelude` (codemode prelude assets), `device-service-core` (SDK over the OmC device service local API v1). All private, none published. |
| **Worker** | 1 | `get-worker` (private npm `omc-get-worker`): the only Cloudflare Worker in the repo. |

## PLATFORM LAUNCHER PACKAGES (12)
`oh-my-cybersecurity-darwin-arm64`, `oh-my-cybersecurity-darwin-x64`, `oh-my-cybersecurity-darwin-x64-baseline`, `oh-my-cybersecurity-linux-arm64`, `oh-my-cybersecurity-linux-arm64-musl`, `oh-my-cybersecurity-linux-x64`, `oh-my-cybersecurity-linux-x64-baseline`, `oh-my-cybersecurity-linux-x64-musl`, `oh-my-cybersecurity-linux-x64-musl-baseline`, `oh-my-cybersecurity-windows-x64`, `oh-my-cybersecurity-windows-x64-baseline`, `oh-my-cybersecurity-windows-arm64`.

Each contains only a `bin/oh-my-cybersecurity.js` launcher and a `package.json`. [`script/build-binaries.ts`](../script/build-binaries.ts) writes the same generated Node-compatible launcher payload from `createPlatformLauncherSource()` to all 12 packages; these are not distinct native binaries, and the build does not perform native compilation. Published by the `publish-platform.yml` workflow. `-baseline` and `-musl` suffixes remain package-selection and compatibility metadata. Current generated launcher payloads are identical Node scripts; the suffixes preserve x64 CPU and musl libc compatibility routing, respectively. The `windows-arm64` entry targets Windows-on-ARM through x64 emulation, with the launcher’s Node fallback available when Bun cannot run. Runtime selection happens in `bin/` and `postinstall.mjs`.

## MCP PACKAGES

| Package | Layout | Purpose |
|---------|--------|---------|
| `lsp-tools-mcp/` | Vendored standalone project (`.github/`, `CHANGELOG.md`, `LICENSE`, `src/`, `test/`, `biome.json`, `vitest.config.ts`) | Serves the 8 aliases `lsp_status`, `lsp_diagnostics`, `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_prepare_rename`, `lsp_rename`, `lsp_install_decision` via stdio MCP. Registered as tier-1 MCP `lsp` in [`packages/omc-opencode/src/mcp/`](omc-opencode/src/mcp/AGENTS.md). Node-targeted, built with `npm` + vitest, and consumes `lsp-core` + `mcp-stdio-core`. |
| [`git-bash-mcp/`](git-bash-mcp/AGENTS.md) | Internal package (`src/`, `dist/`, `tsconfig.json`) | stdio MCP serving the Windows-only `git_bash` tool for the Codex edition (Bun-targeted, unlike the other two). Tier-1 MCP. |
| `lsp-daemon/` | Vendored standalone project (`src/`, `test/`, `scripts/`, `biome.json`, `package-lock.json`) | Shared per-user LSP **daemon** over a unix socket (Windows named pipe) + a stdio MCP **proxy** + a tool client, consuming `lsp-core` + `mcp-stdio-core`. Lets multiple Codex sessions share one warm LSP process. Bin `omc-lsp-daemon`. Node-targeted (`npm` + vitest). See [`packages/lsp-daemon/AGENTS.md`](lsp-daemon/AGENTS.md). |
| [`ast-grep-mcp/`](ast-grep-mcp/AGENTS.md) | Internal package (`src/`, `tsconfig.json`) | stdio MCP `ast_grep` (tools `search`/`rewrite`/`scan`) wrapping the `sg` CLI. Bin `omc-ast-grep`. Bun-targeted, consumes `mcp-stdio-core` + `utils`. Built by `build:ast-grep-mcp` and staged into the Senpi plugin runtime by `build:senpi-plugin`. |

## CORE PACKAGES

| Package | Layout | Purpose |
|---------|--------|---------|
| [`utils/`](utils/AGENTS.md) | `src/`, `tsconfig.json` | Shared utilities: deep-merge, snake-case, frontmatter, file-utils, etc. |
| [`model-core/`](model-core/AGENTS.md) | `src/`, `tsconfig.json` | Model resolution pipeline with ProviderCache dependency injection. |
| [`prompts-core/`](prompts-core/AGENTS.md) | `src/`, `prompts/`, `test/`, `tsconfig.json` | Harness-neutral markdown prompt loading, model-variant routing, and bundled mode prompts for search/analyze/team/hyperplan. |
| [`rules-engine/`](rules-engine/AGENTS.md) | `src/`, `tsconfig.json` | Rule discovery + matching engine (renamed from `rules-core`). |
| [`agents-md-core/`](agents-md-core/AGENTS.md) | `src/`, `tsconfig.json` | AGENTS.md walk-up discovery and injection logic. |
| [`comment-checker-core/`](comment-checker-core/AGENTS.md) | `src/`, `tsconfig.json` | apply-patch parser and binary runner with injectable spawn. |
| [`hashline-core/`](hashline-core/AGENTS.md) | `src/`, `tsconfig.json` | Hashline edit primitives and diff helpers shared by adapter shims. |
| [`boulder-state/`](boulder-state/AGENTS.md) | `src/`, `tsconfig.json` | Work tracking state machine with split storage. |
| [`memory-core/`](memory-core/AGENTS.md) | `src/`, `tsconfig.json` | Harness-neutral Letta-Code-parity memory engine: git MemFS substrate, memory tools, committed-HEAD compiler, reflection state machine, FTS-lite search, locks. |
| [`telemetry-core/`](telemetry-core/AGENTS.md) | `src/`, `tsconfig.json` | Harness-neutral telemetry primitives and PostHog wrappers. |
| [`lsp-core/`](lsp-core/AGENTS.md) | `src/`, `tsconfig.json` | Harness-neutral LSP engine, request context, tool definitions, and MCP entry helpers. |
| [`mcp-stdio-core/`](mcp-stdio-core/AGENTS.md) | `src/`, `tsconfig.json` | Shared JSON-RPC stdio framing and dispatch primitives for MCP servers. |
| [`tmux-core/`](tmux-core/AGENTS.md) | `src/`, `tsconfig.json` | Harness-neutral tmux session, pane, layout, and runner primitives. |
| [`claude-code-compat-core/`](claude-code-compat-core/AGENTS.md) | `src/`, `tsconfig.json` | Claude Code compatibility loaders for plugins, MCPs, commands, and agents. |
| [`skills-loader-core/`](skills-loader-core/AGENTS.md) | `src/`, `tsconfig.json` | Skill loading, builtin skill, runtime skill, and skill matching primitives. |
| [`mcp-client-core/`](mcp-client-core/AGENTS.md) | `src/`, `tsconfig.json` | MCP client lifecycle, skill-embedded MCP manager, and OAuth primitives. |
| [`openclaw-core/`](openclaw-core/AGENTS.md) | `src/`, `tsconfig.json` | OpenClaw gateway, reply-listener daemon, session registry, and tmux injection primitives. |
| [`team-core/`](team-core/AGENTS.md) | `src/`, `tsconfig.json` | Team-mode registry, mailbox, tasklist, state, worktree, and tmux layout domain primitives. |
| [`delegate-core/`](delegate-core/AGENTS.md) | `src/`, `tsconfig.json` | Delegate task selection and retry primitives. |
| [`omc-config-core/`](omc-config-core/AGENTS.md) | `src/`, `tsconfig.json` | Harness-neutral `omc.json` schema, walked loader, and comment-preserving atomic writer. |

## ADAPTERS

- **`omc-opencode`** is the OpenCode Ultimate edition - the former root `src/`, moved here by the package layering refactor (100% git rename). It is the build entry for the main npm dist (`packages/omc-opencode/src/index.ts` → root `dist/`) and holds all 11 agents, ~55 hooks, native tools, features, and built-in MCPs. Full breakdown in [`packages/omc-opencode/src/AGENTS.md`](omc-opencode/src/AGENTS.md).
- **`omc-codex`** is the Codex CLI Light edition (vendored Codex plugin namespace `omc` + TS installer + telemetry); its live npm alias is `lazycodex-ai`, while `lazycodex` is the repository/bin identity and `code-yeongyu/lazycodex` is the marketplace repo; full layout in [`packages/omc-codex/AGENTS.md`](omc-codex/AGENTS.md) and the publish/deploy pipeline in the root [`AGENTS.md`](../AGENTS.md).
- **`omc-senpi`** is the native Senpi TypeScript extension adapter. It builds one local-path Pi package at `packages/omc-senpi/plugin` with 34 registered components (`createOmoSenpiComponents()` in `src/extension/component-list.ts`), the majors being `ultrawork`, `ulw-execute-continuation`, `ulw-loop`, `comment-checker`, `telemetry`, `lsp`, `task` (the `task` component drives the `@oh-my-cybersecurity/senpi-task` engine and reads `omc.json` via `@oh-my-cybersecurity/omc-config-core`), `memory`, and `init-deep-advisor`. Rules are intentionally excluded because Senpi has builtin rules. V1 is local-path install only; do not describe npm, git, or marketplace distribution unless the implementation changes. Full breakdown in [`packages/omc-senpi/AGENTS.md`](omc-senpi/AGENTS.md).
- **`senpi-task`** is the Senpi-coupled task engine consumed only by `omc-senpi`: the task state machine, record store, in-process + RPC runners, residency/TTL/reconcile lifecycle, completion notifier, steering engine, named-team runtime, and the 7 task + 12 team `ToolDefinition`s. Full breakdown in [`packages/senpi-task/AGENTS.md`](senpi-task/AGENTS.md).
- **`omc-native`** is the npm `omc-ai` distribution package (BETA channel only): `bin/` launcher that spawns the exact-pinned `@code-yeongyu/senpi` CLI with the staged omc-senpi plugin payload, owns `canonicalAgentDir()` (`~/.omc/agent`), and answers `--version`/self-update under the omc brand. Full breakdown in [`packages/omc-native/AGENTS.md`](omc-native/AGENTS.md).

## CONVENTIONS

- **No new package without explicit need.** Adding a sibling package complicates publish + CI. Justify the boundary first.
- **Platform launcher packages** are generated. Do NOT edit their launcher payloads by hand. Modify [`script/build-binaries.ts`](../script/build-binaries.ts).
- **`lsp-tools-mcp` + `lsp-daemon` are vendored Node-targeted source.** Build them with `bun run build:lsp-tools-mcp` / `bun run build:lsp-daemon` (each runs `npm ci` + `npm run build`) before workflows or package tasks that need their `dist/`.
- **`packages/web/` is excluded from root `bun test`** (own [`web-ci.yml`](../.github/workflows/web-ci.yml)); non-platform packages build in root `ci.yml`, platform launchers only via `publish-platform.yml` (triggered by `publish.yml`).

## ANTI-PATTERNS

- Never publish a sibling package manually. Use the GitHub Actions workflows.
- Never copy code between packages by hand. Either share via a core package or accept the duplication and document it.
- Never modify `bin/oh-my-cybersecurity.js` inside a platform launcher package - regenerate it through `script/build-binaries.ts`.
