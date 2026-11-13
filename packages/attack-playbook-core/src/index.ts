// Public barrel for the attack playbook corpus.
//
// `./types` declares resolveCommand/isRunnable and `./resolve` implements them,
// so a bare star export of both is ambiguous (tsgo TS2308: "has already exported
// a member named ..."). The named re-export below pins the implementation as the
// consumer-visible one.
export * from "./types"
export * from "./loader"
export * from "./resolve"
export { isRunnable, resolveCommand } from "./resolve"
