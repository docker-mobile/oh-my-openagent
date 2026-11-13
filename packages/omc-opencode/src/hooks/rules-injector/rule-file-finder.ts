import { setSisyphusRuleDeprecationLogger } from "@oh-my-cybersecurity/rules-engine";
import { log } from "../../shared/logger";

setSisyphusRuleDeprecationLogger(log);

export { findRuleFiles } from "@oh-my-cybersecurity/rules-engine";
export type { FindRuleFilesOptions } from "@oh-my-cybersecurity/rules-engine";
