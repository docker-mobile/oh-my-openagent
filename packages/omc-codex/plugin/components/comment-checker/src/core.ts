export { isRecord, parseApplyPatchRequests } from "@oh-my-cybersecurity/comment-checker-core";
export { toHookInput } from "./hook-input.js";
export { extractCommentCheckRequests, isToolFailureOutput } from "./request-extractor.js";
export type {
	CheckerEdit,
	CheckerToolInput,
	CheckerToolName,
	CommentCheckerHookInput,
	CommentCheckRequest,
	ImageContent,
	TextContent,
	ToolResultContent,
	ToolResultLike,
} from "./types.js";
