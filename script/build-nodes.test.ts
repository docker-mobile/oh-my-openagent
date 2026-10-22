import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BUILD_NODES, BUILD_PROFILES, selectBuildNodes } from "./build-nodes"

describe("selectBuildNodes", () => {
	test("#given no profile #when the graph is selected #then every node runs", () => {
		expect(selectBuildNodes(BUILD_NODES, undefined)).toEqual([...BUILD_NODES])
		expect(selectBuildNodes(BUILD_NODES, "")).toEqual([...BUILD_NODES])
	})

	test("#given the omo-native profile #when the graph is selected #then only what the compiled binary consumes survives", () => {
		const selected = selectBuildNodes(BUILD_NODES, "omo-native").map((node) => node.id)
		for (const id of BUILD_PROFILES["omo-native"]) expect(selected).toContain(id)
		// The binary embeds both MCP runtime dists. ensurePrebuiltNativeInputs only builds them when
		// ABSENT, so leaving them out of the profile lets a stale dist from an older commit ship
		// under the new commit's provenance.
		expect(selected).toContain("lsp-daemon")
		expect(selected).toContain("ast-grep-mcp")
		// The payload the binary embeds is built by build-omo-native, so the product build
		// (OpenCode plugin bundle, Codex Light plugin, CLI, TUI, schemas, declarations) is not
		// an input to it and must not run for a binary build.
		for (const id of ["index", "tui", "cli", "cli-node", "codex-install", "codex-plugin", "senpi-plugin", "declarations", "schema", "omo-schema", "shared-skills-assets", "node-require-shim", "lsp-tools-mcp", "git-bash-mcp"]) {
			expect(selected).not.toContain(id)
		}
	})

	test("#given a profile naming a node with dependencies #when selected #then the dependency closure comes with it", () => {
		const graph = [
			{ id: "leaf", command: "bun", args: [], deps: [] },
			{ id: "middle", command: "bun", args: [], deps: ["leaf"] },
			{ id: "top", command: "bun", args: [], deps: ["middle"] },
			{ id: "unrelated", command: "bun", args: [], deps: [] },
		]
		const selected = selectBuildNodes(graph, "test-closure", { "test-closure": ["top"] }).map((node) => node.id)
		expect(selected).toEqual(["leaf", "middle", "top"])
	})

	test("#given an unknown profile or an unknown node #when selected #then it fails loudly instead of building nothing", () => {
		expect(() => selectBuildNodes(BUILD_NODES, "does-not-exist")).toThrow(/unknown build profile/)
		expect(() => selectBuildNodes(BUILD_NODES, "broken", { broken: ["no-such-node"] })).toThrow(/unknown node/)
	})

	test("#given the declared graph #when every dependency is resolved #then no node depends on a missing id", () => {
		const ids = new Set(BUILD_NODES.map((node) => node.id))
		for (const node of BUILD_NODES) {
			for (const dep of node.deps) expect(ids).toContain(dep)
		}
	})

	test("#given the dual-host package #when the v2 entry is built #then the ./server export resolves it and the shim follows", () => {
		// The v2 bundle node must exist and write dist/v2.js from the v2 entry.
		const v2 = BUILD_NODES.find((node) => node.id === "v2")
		expect(v2).toBeDefined()
		expect(v2!.args).toContain("packages/omo-opencode/src/v2/index.ts")
		expect(v2!.args).toContain("dist/v2.js")
		// The require-shim node must run after both bundles exist.
		const shim = BUILD_NODES.find((node) => node.id === "node-require-shim")
		expect(shim!.deps).toContain("v2")
		// And the published root package must point ./server at that bundle, so
		// an OpenCode 2.x host resolves the dual definition instead of the V1
		// bundle (the OpenCode-Go plugin compatibility path).
		const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"))
		expect(pkg.exports["./server"]).toBe("./dist/v2.js")
	})
})
