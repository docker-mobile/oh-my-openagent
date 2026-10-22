#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const IMPORT_LINE = 'import { createRequire as __omoCreateRequire } from "node:module";'
const BUN_REQUIRE_LINE = "var __require = import.meta.require;"
const NODE_SAFE_REQUIRE_LINE = 'var __require = typeof import.meta.require === "function" ? import.meta.require : __omoCreateRequire(import.meta.url);'

/**
 * Patches one bundled dist file so `import.meta.require` (a Bun-ism the V1 graph
 * emits) survives Node/Electron hosts. The main bundle always carries the Bun
 * helper; the 2.x bundle may legitimately lack it (when the V1 graph behind the
 * lazy import produced no require call), so a missing helper there is a skip,
 * not an error.
 */
function patchBundle(distPath: string, required: boolean): void {
	let original: string
	try {
		original = readFileSync(distPath, "utf-8")
	} catch {
		if (required) throw new Error(`expected bundle not found: ${distPath}`)
		console.log(`${distPath} not built, skipping.`)
		return
	}

	if (original.includes(NODE_SAFE_REQUIRE_LINE)) {
		console.log(`Node/Electron require shim already present in ${distPath}, skipping.`)
		return
	}

	if (!original.includes(BUN_REQUIRE_LINE)) {
		if (required) {
			throw new Error(`Expected Bun require helper not found in ${distPath}`)
		}
		console.log(`No Bun require helper in ${distPath}, nothing to patch.`)
		return
	}

	const patched = original.replace(BUN_REQUIRE_LINE, `${IMPORT_LINE}\n${NODE_SAFE_REQUIRE_LINE}`)
	writeFileSync(distPath, patched, "utf-8")
	console.log(`Patched Node/Electron require shim in ${distPath}`)
}

const DIST_PATH = join(SCRIPT_DIR, "..", "dist", "index.js")
const V2_DIST_PATH = join(SCRIPT_DIR, "..", "dist", "v2.js")

patchBundle(DIST_PATH, true)
patchBundle(V2_DIST_PATH, false)
