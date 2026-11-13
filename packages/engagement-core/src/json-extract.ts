/**
 * Tolerant JSON extraction from model prose. A model asked for a structured
 * reply routinely wraps it in commentary, and a prose preamble may carry stray
 * braces that belong to no object (`Step {1} of {2}`); scanning for the first
 * brace-balanced span that actually parses survives both.
 *
 * The scanner is string- and escape-aware, so a brace inside a quoted string
 * never changes the depth count.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `_extract_first_balanced` and
 * `extract_json_object` in `lib/sapper.py`. See NOTICE.
 */

/**
 * Scans from `start` (which must be the index of a `{`) to its matching `}`.
 * Returns the parsed value and the index past the closing brace, or null when
 * the balanced span is not valid JSON so the caller can try the next `{`.
 */
function extractFirstBalanced(text: string, start: number): { parsed: unknown; end: number } | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const char = text[i] as string

    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        const blob = text.slice(start, i + 1)
        try {
          return { parsed: JSON.parse(blob) as unknown, end: i + 1 }
        } catch {
          return null
        }
      }
    }
  }

  return null
}

/**
 * Finds the first brace-balanced object in `text` that JSON.parses, trying each
 * balanced object in turn so a stray pair of braces in the preamble does not
 * mask the real payload. Returns null when nothing parses.
 *
 * The result is typed for the caller's convenience only: the parse is
 * UNVALIDATED, so `T` is an unchecked assertion about a value nothing here
 * verified. Validate the returned value against the payload contract you
 * actually require before acting on it.
 */
export function extractJsonObject<T = unknown>(text: string): T | null {
  let position = 0

  while (position < text.length) {
    const start = text.indexOf("{", position)
    if (start === -1) return null

    const balanced = extractFirstBalanced(text, start)
    if (balanced !== null) return balanced.parsed as T

    position = start + 1
  }

  return null
}
