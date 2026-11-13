#!/usr/bin/env bash
set -euo pipefail
bun run build:senpi-plugin
PACK_DIR="$RUNNER_TEMP/omc-senpi-pack"
mkdir -p "$PACK_DIR"
npm pack --pack-destination "$PACK_DIR" packages/omc-senpi/plugin
npm --prefix packages/lsp-daemon test -- test/daemon-roundtrip.test.ts
bun check --no-script --all -p packages/omc-senpi/tsconfig.json
bun test ./.agents/skills/senpi-qa/scripts/resolve-evidence-dir.test.mjs
bun test --timeout 20000 packages/omc-senpi
