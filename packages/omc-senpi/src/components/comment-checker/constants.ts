export const COMMENT_CHECKER_FEEDBACK_HEADER = "comment-checker found issues in"
export const COMMENT_CHECKER_ENV_KEY = "OMC_COMMENT_CHECKER_BIN"
export const COMMENT_CHECKER_PACKAGE_NAME = "@code-yeongyu/comment-checker"
// Must equal the OpenCode edition's CACHE_DIR_NAME (omc-opencode shared/plugin-identity.ts) so one
// downloaded binary serves both editions; comment-checker.downloader.test.ts pins the equality.
export const COMMENT_CHECKER_CACHE_DIR_NAME = "oh-my-cybersecurity"
