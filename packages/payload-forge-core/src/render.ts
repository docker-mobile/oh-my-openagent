/**
 * Renderer for the frozen payload-forge contract.
 *
 * A body carries placeholders in the corpus convention `§NAME§`. A render substitutes
 * a caller-supplied value, else the declared variable's defaultValue, else leaves the
 * token VERBATIM and reports the name in `unresolved` so a caller can see which
 * variable is missing rather than receiving a silently blanked payload. A supplied value
 * wins even when it is the empty string; a name absent from `values` is never blanked.
 * Substitution is single-pass and literal, and token names are exact and case-sensitive.
 */
import type { PayloadTemplate, RenderResult } from "./types"

const VARIABLE_TOKEN = /\u00a7([A-Za-z0-9_]+)\u00a7/g

export function renderPayload(
  template: PayloadTemplate,
  values: Readonly<Record<string, string>> = {},
): RenderResult {
  const defaults = new Map<string, string>()
  for (const variable of template.variables) {
    if (variable.defaultValue !== null) defaults.set(variable.name, variable.defaultValue)
  }

  const missing = new Set<string>()
  const body = template.body.replace(VARIABLE_TOKEN, (token: string, name: string): string => {
    const override = ownStringValue(values, name)
    if (override !== undefined) return override
    const fallback = defaults.get(name)
    if (fallback !== undefined) return fallback
    missing.add(name)
    return token
  })

  return { body, unresolved: [...missing] }
}

function ownStringValue(values: Readonly<Record<string, string>>, name: string): string | undefined {
  if (!Object.hasOwn(values, name)) return undefined
  const value = values[name]
  return typeof value === "string" ? value : undefined
}
