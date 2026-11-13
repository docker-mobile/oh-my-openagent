import type { OmoMemorySettings } from "@oh-my-cybersecurity/omc-config-core"
import type { ExternalProjectionLimits } from "@oh-my-cybersecurity/memory-core"

export function projectionLimits(settings: OmoMemorySettings, identity: string): ExternalProjectionLimits {
  const projection = { ...settings.projection, ...settings.agents[identity]?.projection }
  return { maxEntriesPerDirectory: projection.max_entries_per_directory, maxBytes: projection.max_bytes }
}
