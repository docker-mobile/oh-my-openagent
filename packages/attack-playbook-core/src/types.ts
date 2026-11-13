// Frozen contract for the attack playbook. Every node of the corpus pipeline -
// the ingest scaffold, the command resolver, and the query surface - codes
// against these names and shapes. Do not rename or reshape them.

export const EXECUTOR_TYPES = ["command", "sh", "bash", "powershell", "pwsh", "python", "manual"] as const
export type ExecutorType = (typeof EXECUTOR_TYPES)[number]

export const TECHNIQUE_PLATFORMS = ["windows", "linux", "macos", "containers", "iaas", "network", "office-365", "azure-ad", "google-workspace", "saas", "iac", "unknown"] as const
export type TechniquePlatform = (typeof TECHNIQUE_PLATFORMS)[number]

export interface InputArgument { readonly description: string; readonly type: string; readonly default: string | null }
export interface AtomicDependency { readonly description: string; readonly prereqCommand: string; readonly getPrereqCommand: string | null; readonly executor: ExecutorType }
export interface AtomicExecutor { readonly name: ExecutorType; readonly command: string; readonly cleanupCommand: string | null; readonly elevationRequired: boolean; readonly steps: readonly string[] }
export interface AtomicTest { readonly technique: string; readonly displayName: string; readonly index: number; readonly guid: string; readonly name: string; readonly description: string; readonly platforms: readonly TechniquePlatform[]; readonly arguments: Readonly<Record<string, InputArgument>>; readonly dependencies: readonly AtomicDependency[]; readonly executor: AtomicExecutor; readonly manual: boolean }
export interface Technique { readonly id: string; readonly displayName: string; readonly tactics: readonly string[]; readonly atomics: readonly AtomicTest[] }
export interface PlaybookIndex { readonly techniques: number; readonly atomics: number; readonly generatedAt: string; readonly pin: string }
export interface ResolvedCommand { readonly command: string; readonly unresolved: readonly string[]; readonly executor: ExecutorType }

// Implemented by ./resolve.ts. Declared here so the contract stands on its own
// and the resolver stays free to change without touching the shape.
export declare function resolveCommand(test: AtomicTest, overrides?: Readonly<Record<string, string>>): ResolvedCommand
export declare function isRunnable(test: AtomicTest): boolean
