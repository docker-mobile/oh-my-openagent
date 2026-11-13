import { getPluginEntryName, withPluginEntryName, type PluginEntry } from "./plugin-entry-shape"
import { ACCEPTED_PACKAGE_NAMES, PLUGIN_NAME } from "./plugin-identity"

const LEGACY_PACKAGE_NAMES = ACCEPTED_PACKAGE_NAMES.filter((name) => name !== PLUGIN_NAME)

function legacyPrefixFor(name: string): string | undefined {
  return LEGACY_PACKAGE_NAMES.find(
    (legacy) => name === legacy || name.startsWith(`${legacy}@`),
  )
}

export function isLegacyEntry(entry: PluginEntry): boolean {
  return legacyPrefixFor(getPluginEntryName(entry)) !== undefined
}

export function isCanonicalEntry(entry: PluginEntry): boolean {
  const name = getPluginEntryName(entry)
  return name === PLUGIN_NAME || name.startsWith(`${PLUGIN_NAME}@`)
}

export function toCanonicalEntry(entry: PluginEntry): PluginEntry {
  const name = getPluginEntryName(entry)
  const legacy = legacyPrefixFor(name)
  if (legacy === undefined) return entry

  return withPluginEntryName(entry, `${PLUGIN_NAME}${name.slice(legacy.length)}`)
}
