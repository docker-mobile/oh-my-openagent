/**
 * Cross-platform check if a path is inside .omc/ directory.
 * Handles both forward slashes (Unix) and backslashes (Windows).
 * Uses path segment matching instead of substring matching.
 */
export function isOmoPath(filePath: string): boolean {
  return /(^|[/\\])\.omc([/\\]|$)/.test(filePath)
}
