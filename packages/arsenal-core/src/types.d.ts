export declare const ARSENAL_SOURCES: readonly ["gtfobins", "lolbas"];
export type ArsenalSource = (typeof ARSENAL_SOURCES)[number];
export type OffensiveAction = "execute" | "shell" | "reverse-shell" | "bind-shell" | "file-read" | "file-write" | "upload" | "download" | "privilege-escalation" | "credential-access" | "defense-evasion" | "persistence" | "lateral-movement" | "uac-bypass" | "injection" | "recon";
export interface PrimitiveCommand {
    readonly code: string;
    readonly description: string;
    readonly usecase: string;
    readonly category: string;
    readonly privileges: string;
    readonly contexts: readonly string[];
    readonly variant?: string;
}
export interface OffensivePrimitive {
    readonly source: ArsenalSource;
    readonly id: string;
    readonly binary: string;
    readonly name: string;
    readonly description: string;
    readonly actions: readonly OffensiveAction[];
    readonly platform: readonly string[];
    readonly mitre: readonly string[];
    readonly commands: readonly PrimitiveCommand[];
    readonly tags: readonly string[];
}
export interface ArsenalIndex {
    readonly sources: Readonly<Record<ArsenalSource, number>>;
    readonly generatedAt: string;
    readonly upstreamPins: Readonly<Record<ArsenalSource, string>>;
}
export interface PrimitiveQuery {
    readonly action?: OffensiveAction;
    readonly platform?: string;
    readonly binary?: string;
    readonly text?: string;
    readonly mitre?: string;
    readonly source?: ArsenalSource;
    readonly limit?: number;
}
export declare function searchPrimitives(primitives: readonly OffensivePrimitive[], query: PrimitiveQuery): OffensivePrimitive[];
