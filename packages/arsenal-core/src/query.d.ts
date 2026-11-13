import type { OffensivePrimitive, PrimitiveQuery } from "./types";
export interface ArsenalRankState {
    readonly privilege: "user" | "sudo" | "root" | "suid" | "system";
    readonly platform: "linux" | "macos" | "unix" | "windows";
    readonly tty: boolean;
    readonly hasShell: boolean;
}
export declare function searchPrimitives(primitives: readonly OffensivePrimitive[], query: PrimitiveQuery): OffensivePrimitive[];
export declare function rankForState(state: ArsenalRankState, primitives: readonly OffensivePrimitive[]): OffensivePrimitive[];
