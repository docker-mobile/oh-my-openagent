#!/usr/bin/env bash
set -euo pipefail
bun run build:codex-install
bun run build:git-bash-mcp
bun run build:lsp-tools-mcp
bun run build:lsp-daemon
npm --prefix packages/omc-codex/plugin ci
bun run --cwd packages/omc-codex/plugin build
