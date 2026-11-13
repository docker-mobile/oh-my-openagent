import { type ArsenalIndex, type ArsenalSource, type OffensivePrimitive } from "./types";
export declare class CorpusLoadError extends Error {
    readonly filePath: string;
    readonly source: ArsenalSource | undefined;
    constructor(message: string, filePath: string, source: ArsenalSource | undefined, cause?: unknown);
}
export declare function primitivesFilePath(dataRoot: string, source: ArsenalSource): string;
export declare function indexFilePath(dataRoot: string): string;
export declare function defaultDataRoot(): string;
/**
 * Candidate roots for the generated corpus, most-specific first. The bundled CLI
 * inlines this module into dist/, so the module-relative path alone resolves to
 * dist/data and misses the package's own data directory. Every candidate is a
 * real layout: the package (source), the package (packed), and the repo checkout.
 */
export declare function dataRootCandidates(): string[];
/** The first candidate that actually holds an index file, else the module-relative default. */
export declare function resolveDataRoot(explicit?: string): string;
export declare function loadPrimitives(dataRoot: string, source: ArsenalSource): Promise<OffensivePrimitive[]>;
export declare function loadIndex(dataRoot: string): Promise<ArsenalIndex>;
