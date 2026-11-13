/**
 * Retired builtin agent names and the canonical name that replaced them.
 *
 * The ulw-loop reviewer trio was named after the engine before the standalone edition was branded
 * OmC Native. Users address these agents by name from skills, AGENTS.md files and `task` calls, so
 * the old spelling keeps resolving for one release line; only the resolution site consults this
 * map, which leaves exactly one definition per agent.
 */
export const LEGACY_AGENT_NAME_ALIASES: Readonly<Record<string, string>> = {
  "omc-senpi-code-reviewer": "omc-native-code-reviewer",
  "omc-senpi-gate-reviewer": "omc-native-gate-reviewer",
  "omc-senpi-qa-executor": "omc-native-qa-executor",
}

export function canonicalAgentName(name: string): string {
  return Object.hasOwn(LEGACY_AGENT_NAME_ALIASES, name) ? LEGACY_AGENT_NAME_ALIASES[name] : name
}
