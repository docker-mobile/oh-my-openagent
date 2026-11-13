# Re-export Shim Inventory

This inventory tracks adapter shims that preserve old `packages/omc-opencode/src/` and `packages/omc-codex/src/` import paths while the implementation lives in extracted packages. These files should stay thin: a shim re-exports from `@oh-my-cybersecurity/*` and should not regain local logic.

Exact scan definition: a shim is a tracked `.ts` file under `packages/omc-opencode/src` or `packages/omc-codex/src` whose first line matches `/^export (\*|\{).*from ["']@oh-my-cybersecurity\//`.

Generated command:

```bash
git ls-files packages/omc-opencode/src packages/omc-codex/src | grep '\.ts$' | sort | xargs awk 'FNR==1 && /^export (\*|\{).*from ["'"'"']@oh-my-cybersecurity\// { print FILENAME }'
```

Snapshot date: 2026-08-31. Total shim exports found: 226.

## Aggregate By Target Package

| Target package | Shim exports |
|---|---:|
| `@oh-my-cybersecurity/agents-md-core` | 2 |
| `@oh-my-cybersecurity/boulder-state` | 1 |
| `@oh-my-cybersecurity/claude-code-compat-core` | 33 |
| `@oh-my-cybersecurity/delegate-core` | 1 |
| `@oh-my-cybersecurity/hashline-core` | 6 |
| `@oh-my-cybersecurity/mcp-client-core` | 21 |
| `@oh-my-cybersecurity/model-core` | 7 |
| `@oh-my-cybersecurity/omc-codex` | 41 |
| `@oh-my-cybersecurity/openclaw-core` | 22 |
| `@oh-my-cybersecurity/rules-engine` | 4 |
| `@oh-my-cybersecurity/skills-loader-core` | 61 |
| `@oh-my-cybersecurity/team-core` | 37 |
| `@oh-my-cybersecurity/tmux-core` | 3 |
| `@oh-my-cybersecurity/utils` | 47 |

## Exhaustive Shim Paths

| Shim path | Target package |
|---|---|
| `packages/omc-codex/src/telemetry/atomic-write.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-bins.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-bundled-mcps.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-command-shim.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-fs.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-install.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-legacy-bins.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-local-dependencies.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-mcp-manifest.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-paths.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache-prune.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cache.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cached-marketplace-manifest.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cleanup-config.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-cleanup.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-agents.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-features.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-marketplaces.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-permissions.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-plugins.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-reasoning.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-toml-sections.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-config-toml.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-hook-trust.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-installation-detection.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-installer-bin-dir.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-marketplace-snapshot.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-marketplace.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-model-catalog.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-multi-agent-v2-config.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-package-layout.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-process.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-project-local-cleanup-best-effort.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/codex-project-local-cleanup.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/git-bash.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/index.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/install-codex.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/lazycodex-version-stamp.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/link-cached-plugin-agents.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/lsp-daemon-reaper.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/toml-section-editor.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/install-codex/types.ts` | `@oh-my-cybersecurity/omc-codex` |
| `packages/omc-opencode/src/cli/provider-model-id-transform.ts` | `@oh-my-cybersecurity/model-core` |
| `packages/omc-opencode/src/config/schema/git-env-prefix.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/config/schema/team-mode.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/boulder-state/format-duration.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/features/boulder-state/top-level-task.ts` | `@oh-my-cybersecurity/boulder-state` |
| `packages/omc-opencode/src/features/claude-code-agent-loader/agent-definitions-loader.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-agent-loader/claude-model-mapper.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-agent-loader/index.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-agent-loader/json-agent-loader.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-agent-loader/loader.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-agent-loader/types.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-command-loader/index.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-command-loader/types.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-mcp-loader/configure-allowed-env-vars.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-mcp-loader/index.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-mcp-loader/loader.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-mcp-loader/scope-filter.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-mcp-loader/transformer.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/claude-code-mcp-loader/types.ts` | `@oh-my-cybersecurity/claude-code-compat-core` |
| `packages/omc-opencode/src/features/mcp-oauth/callback-server.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/dcr.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/discovery.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/oauth-authorization-flow.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/provider.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/refresh-mutex.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/resource-indicator.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/schema.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/step-up.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/mcp-oauth/storage.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/opencode-runtime-skills/index.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-runtime-skills/runtime-skill-config.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-runtime-skills/skill-markdown.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-runtime-skills/source-server.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/allowed-tools-parser.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/git-master-template-injection.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/index.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/loaded-skill-from-path.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/loaded-skill-template-extractor.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/loader.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/merger.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/merger/builtin-skill-converter.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/merger/scope-priority.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/merger/skill-definition-merger.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/merger/skills-config-normalizer.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-content.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-deduplication.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-definition-record.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-directory-loader.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-discovery.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-mcp-config.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-resolution-options.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/skill-template-resolver.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/opencode-skill-loader/types.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/cleanup.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/connection-type.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/connection.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/env-cleaner.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/error-redaction.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/http-client.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/index.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/manager.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/oauth-handler.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/stdio-client.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/skill-mcp-manager/types.ts` | `@oh-my-cybersecurity/mcp-client-core` |
| `packages/omc-opencode/src/features/team-mode/member-parser.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-layout-tmux/index.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-layout-tmux/layout.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-layout-tmux/rebalance-team-window.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-layout-tmux/sweep-stale-team-sessions.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/ack.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/inbox.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/index.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/pending-delivery-recovery.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/poll.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/reservation.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-mailbox/send.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-registry/index.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-registry/loader.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-registry/paths.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-registry/validator.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/active-resume.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/creating-resume.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/deleting-resume.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/error-normalization.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/index.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/locks.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/reservation-reconciliation.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/resume-report.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/resume.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/runtime-cleanup.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/session-liveness.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/store.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-state-store/worker-resume-status.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-tasklist/index.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-tasklist/list.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-tasklist/test-support.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-worktree/cleanup.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-worktree/index.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/team-worktree/manager.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/features/team-mode/types.ts` | `@oh-my-cybersecurity/team-core` |
| `packages/omc-opencode/src/hooks/auto-slash-command/constants.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/hooks/auto-slash-command/detector.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/hooks/auto-slash-command/processed-command-store.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/hooks/auto-slash-command/types.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/hooks/delegate-task-retry/guidance.ts` | `@oh-my-cybersecurity/delegate-core` |
| `packages/omc-opencode/src/hooks/directory-agents-injector/finder.ts` | `@oh-my-cybersecurity/agents-md-core` |
| `packages/omc-opencode/src/hooks/directory-agents-injector/injector.ts` | `@oh-my-cybersecurity/agents-md-core` |
| `packages/omc-opencode/src/hooks/rules-injector/parser.ts` | `@oh-my-cybersecurity/rules-engine` |
| `packages/omc-opencode/src/hooks/rules-injector/project-root-finder.ts` | `@oh-my-cybersecurity/rules-engine` |
| `packages/omc-opencode/src/hooks/rules-injector/rule-distance.ts` | `@oh-my-cybersecurity/rules-engine` |
| `packages/omc-opencode/src/hooks/rules-injector/rule-scan-cache.ts` | `@oh-my-cybersecurity/rules-engine` |
| `packages/omc-opencode/src/openclaw/daemon.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/index.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-discord.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-log.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-paths.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-poll-loop.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-process.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-signature.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-sleep.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-spawn.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-startup.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-state.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-status.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-stop.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener-telegram.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/reply-listener.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/runtime-dispatch.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/session-registry-lock.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/session-registry-paths.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/session-registry-storage.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/session-registry-types.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/openclaw/types.ts` | `@oh-my-cybersecurity/openclaw-core` |
| `packages/omc-opencode/src/shared/archive-entry-validator.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/bun-file-shim.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/bun-which-shim.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/classify-path-environment.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor/embedded-commands.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor/execute-command.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor/execute-hook-command.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor/home-directory.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor/resolve-commands-in-text.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/command-executor/shell-path.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/contains-path.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/deep-merge.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/extract-semver.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/file-utils.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/frontmatter.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/git-worktree/format-file-changes.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/git-worktree/index.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/git-worktree/parse-diff-numstat.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/git-worktree/parse-status-porcelain.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/git-worktree/types.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/internal-initiator-marker.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/migration/hook-names.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/migration/model-versions.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/model-format-normalizer.ts` | `@oh-my-cybersecurity/model-core` |
| `packages/omc-opencode/src/shared/model-normalization.ts` | `@oh-my-cybersecurity/model-core` |
| `packages/omc-opencode/src/shared/model-sanitizer.ts` | `@oh-my-cybersecurity/model-core` |
| `packages/omc-opencode/src/shared/model-string-parser.ts` | `@oh-my-cybersecurity/model-core` |
| `packages/omc-opencode/src/shared/process-stream-reader.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/prompt-failure-classifier.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/provider-model-id-transform.ts` | `@oh-my-cybersecurity/model-core` |
| `packages/omc-opencode/src/shared/record-type-guard.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/replace-tool-args.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/session-idle-settle.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/snake-case.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/tmux/cmux-detect.ts` | `@oh-my-cybersecurity/tmux-core` |
| `packages/omc-opencode/src/shared/tmux/runner.ts` | `@oh-my-cybersecurity/tmux-core` |
| `packages/omc-opencode/src/shared/tmux/tmux-utils/spawn-process.ts` | `@oh-my-cybersecurity/tmux-core` |
| `packages/omc-opencode/src/shared/tool-name.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/zip-entry-listing.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/zip-entry-listing/python-zip-entry-listing.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/zip-entry-listing/read-zip-symlink-target.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/shared/zip-entry-listing/tar-zip-entry-listing.ts` | `@oh-my-cybersecurity/utils` |
| `packages/omc-opencode/src/tools/hashline-edit/edit-deduplication.ts` | `@oh-my-cybersecurity/hashline-core` |
| `packages/omc-opencode/src/tools/hashline-edit/edit-ordering.ts` | `@oh-my-cybersecurity/hashline-core` |
| `packages/omc-opencode/src/tools/hashline-edit/file-text-canonicalization.ts` | `@oh-my-cybersecurity/hashline-core` |
| `packages/omc-opencode/src/tools/hashline-edit/hashline-chunk-formatter.ts` | `@oh-my-cybersecurity/hashline-core` |
| `packages/omc-opencode/src/tools/hashline-edit/hashline-edit-diff.ts` | `@oh-my-cybersecurity/hashline-core` |
| `packages/omc-opencode/src/tools/hashline-edit/normalize-edits.ts` | `@oh-my-cybersecurity/hashline-core` |
| `packages/omc-opencode/src/tools/skill/scope-priority.ts` | `@oh-my-cybersecurity/skills-loader-core` |
| `packages/omc-opencode/src/tools/skill/skill-matcher.ts` | `@oh-my-cybersecurity/skills-loader-core` |

## Backlog

- Keep new extraction compatibility files as one-line re-export shims whenever possible.
- Move a shim out of this inventory only after all in-repo consumers import the extracted package path directly.
- Re-run the inventory scan after extraction PRs that add or remove compatibility files.
