# Sisyphus Labs Codex Marketplace

Native Codex marketplace for the `omc` plugin.

## Plugin

`omc` is one Codex plugin namespace with isolated internal components:

- `components/comment-checker`: runs comment-checker automatically after successful `apply_patch` edits.
- `components/git-bash`: exposes the Windows Git Bash MCP and reminds Codex before shell-like calls.
- `components/rules`: injects local project rule files into Codex context through lifecycle hooks.
- `components/lsp`: exposes Language Server Protocol diagnostics, navigation, symbols, and rename tools through MCP and post-edit hooks.
- `components/ultrawork`: injects the ultrawork orchestration directive when a user prompt contains `ultrawork` or `ulw`.
- `components/ulw-loop`: durable repo-native multi-goal orchestration with embedded success criteria and observable evidence audit (`.omc/ulw-loop/`).
- `components/ulw-execute-continuation`: resumes `.omc/boulder.json` ulw-execute plans from stop boundaries.
- `components/telemetry`: emits anonymous daily active telemetry when enabled.

## Install

```bash
npx lazycodex-ai install
```

The installer builds `omc`, copies a clean versioned cache entry into `~/.codex/plugins/cache/sisyphuslabs/omc`, installs runtime dependencies in the cache, writes a local marketplace snapshot under `~/.codex/.tmp/marketplaces/sisyphuslabs/plugins/omc`, copies bundled-agent TOMLs into `~/.codex/agents/`, registers the `sisyphuslabs` marketplace from the local built cache, and enables `[plugins."omc@sisyphuslabs"]` in `~/.codex/config.toml`.
It also enables both `plugins = true` and `plugin_hooks = true` under `[features]` so bundled hook files run.

If your local Codex build exposes plugin install commands, you can use those instead. For older local builds, the installer replaces the manual copy fallback:

```text
~/.codex/plugins/cache/sisyphuslabs/omc/0.1.0
```
