#!/usr/bin/env bash
set -euo pipefail
node --test packages/omc-codex/scripts/install-local.test.mjs packages/omc-codex/scripts/install-local-entrypoint.test.mjs packages/omc-codex/scripts/install-local-git-bash-preflight.test.mjs packages/omc-codex/scripts/install-cli-args.test.mjs packages/omc-codex/plugin/test/node-install-surface.test.mjs packages/omc-codex/plugin/test/install-time-build-runtime.test.mjs
