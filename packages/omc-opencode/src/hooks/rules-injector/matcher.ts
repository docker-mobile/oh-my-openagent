export {
  createContentHash,
  getMatcherCacheStats,
  isDuplicateByContentHash,
  isDuplicateByRealPath,
  resetMatcherCache,
  shouldApplyRule,
} from "@oh-my-cybersecurity/rules-engine";
export type { MatchResult } from "@oh-my-cybersecurity/rules-engine";

export interface MatcherCacheStats {
  readonly entries: number;
}
