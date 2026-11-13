import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	canonicalReviewerAgentName,
	GATE_REVIEWER_AGENT_NAMES,
	LEGACY_REVIEWER_AGENT_ALIASES,
	REVIEWER_ROLES_BY_SURFACE,
	resolveToolkitSurface,
	reviewerRolesFor,
} from "../src/surface.ts";

let markerDir: string;

beforeEach(async () => {
	markerDir = await mkdtemp(join(tmpdir(), "ulw-surface-"));
});

afterEach(async () => {
	await rm(markerDir, { recursive: true, force: true });
});

describe("resolveToolkitSurface", () => {
	it("#given no marker and no env #when resolved #then defaults to lazycodex", () => {
		expect(resolveToolkitSurface({ env: {}, entryDir: markerDir })).toBe("lazycodex");
	});

	it("#given a staged omc-senpi marker #when resolved #then returns omc-senpi", async () => {
		await writeFile(join(markerDir, "surface.json"), '{"surface":"omc-senpi"}\n', "utf8");

		expect(resolveToolkitSurface({ env: {}, entryDir: markerDir })).toBe("omc-senpi");
	});

	it("#given the env override #when a conflicting marker exists #then the env wins", async () => {
		await writeFile(join(markerDir, "surface.json"), '{"surface":"omc-senpi"}\n', "utf8");

		expect(resolveToolkitSurface({ env: { OMC_AGENT_TOOLKIT_SURFACE: "lazycodex" }, entryDir: markerDir })).toBe(
			"lazycodex",
		);
	});

	it("#given an omc-senpi env override without marker #when resolved #then returns omc-senpi", () => {
		expect(resolveToolkitSurface({ env: { OMC_AGENT_TOOLKIT_SURFACE: "omc-senpi" }, entryDir: markerDir })).toBe(
			"omc-senpi",
		);
	});

	it("#given malformed or unknown markers #when resolved #then falls back to lazycodex", async () => {
		await writeFile(join(markerDir, "surface.json"), "not json at all", "utf8");
		expect(resolveToolkitSurface({ env: {}, entryDir: markerDir })).toBe("lazycodex");

		await writeFile(join(markerDir, "surface.json"), '{"surface":"unknown-surface"}\n', "utf8");
		expect(resolveToolkitSurface({ env: {}, entryDir: markerDir })).toBe("lazycodex");
	});

	it("#given an unknown env value #when a valid marker exists #then the marker still applies", async () => {
		await writeFile(join(markerDir, "surface.json"), '{"surface":"omc-senpi"}\n', "utf8");

		expect(resolveToolkitSurface({ env: { OMC_AGENT_TOOLKIT_SURFACE: "bogus" }, entryDir: markerDir })).toBe(
			"omc-senpi",
		);
	});
});

describe("reviewerRolesFor", () => {
	it("#given each surface #when resolving roles #then the identity namespaces match the surface", () => {
		expect(reviewerRolesFor("lazycodex")).toEqual({
			codeReview: "lazycodex-code-reviewer",
			manualQa: "lazycodex-qa-executor",
			gateReview: "lazycodex-gate-reviewer",
		});
		expect(reviewerRolesFor("omc-senpi")).toEqual({
			codeReview: "omc-native-code-reviewer",
			manualQa: "omc-native-qa-executor",
			gateReview: "omc-native-gate-reviewer",
		});
		expect(Object.keys(REVIEWER_ROLES_BY_SURFACE).sort()).toEqual(["lazycodex", "omc-senpi"]);
	});
});

describe("canonicalReviewerAgentName", () => {
	it("#given a retired reviewer spelling #when canonicalized #then it maps to the omc-native name", () => {
		expect(canonicalReviewerAgentName("omc-senpi-gate-reviewer")).toBe("omc-native-gate-reviewer");
		expect(canonicalReviewerAgentName("omc-senpi-code-reviewer")).toBe("omc-native-code-reviewer");
		expect(canonicalReviewerAgentName("omc-senpi-qa-executor")).toBe("omc-native-qa-executor");
	});

	it("#given a canonical or unrelated name #when canonicalized #then it is returned unchanged", () => {
		expect(canonicalReviewerAgentName("omc-native-gate-reviewer")).toBe("omc-native-gate-reviewer");
		expect(canonicalReviewerAgentName("lazycodex-gate-reviewer")).toBe("lazycodex-gate-reviewer");
		expect(canonicalReviewerAgentName("explore")).toBe("explore");
	});

	it("#given every retired alias #when mapped #then each target is a live reviewer role", () => {
		const liveRoles = new Set(
			Object.values(REVIEWER_ROLES_BY_SURFACE).flatMap((roles) => [
				roles.codeReview,
				roles.manualQa,
				roles.gateReview,
			]),
		);
		for (const canonical of Object.values(LEGACY_REVIEWER_AGENT_ALIASES)) expect(liveRoles.has(canonical)).toBe(true);
	});

	it("#given the gate reviewer name set #when read #then it carries both the canonical and the retired spelling", () => {
		expect(GATE_REVIEWER_AGENT_NAMES.has("omc-native-gate-reviewer")).toBe(true);
		expect(GATE_REVIEWER_AGENT_NAMES.has("omc-senpi-gate-reviewer")).toBe(true);
		expect(GATE_REVIEWER_AGENT_NAMES.has("lazycodex-gate-reviewer")).toBe(true);
		expect(GATE_REVIEWER_AGENT_NAMES.has("omc-native-code-reviewer")).toBe(false);
	});
});
