import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { updateCodexConfig } from "./install-dist/install-local.mjs";

test("#given unrelated Codex config tables #when script installer updates config #then preserves them", async () => {
	// given
	const root = await mkdtemp(join(tmpdir(), "omc-codex-script-config-unrelated-tables-"));
	const configPath = join(root, "config.toml");
	await writeFile(
		configPath,
		[
			"[features]",
			"plugins = false",
			"",
			"[tui]",
			'hud = "compact"',
			"",
			"[shell_environment_policy]",
			'inherit = "core"',
			"",
		].join("\n"),
	);

	// when
	await updateCodexConfig({
		configPath,
		repoRoot: "/repo/packages/omc-codex",
		marketplaceName: "sisyphuslabs",
		marketplaceSource: { sourceType: "local", source: "/repo/packages/omc-codex/cache/sisyphuslabs" },
		pluginNames: ["omc"],
	});

	// then
	const config = await readFile(configPath, "utf8");
	assert.match(config, /\[features\][\s\S]*plugins = true/);
	assert.match(config, /\[tui\][\s\S]*hud = "compact"/);
	assert.match(config, /\[shell_environment_policy\][\s\S]*inherit = "core"/);
	assert.match(config, /\[plugins\."omc@sisyphuslabs"\]/);
});
