/**
 * Barrel for @oh-my-cybersecurity/payload-forge-core.
 *
 * `renderPayload` and `classifyPayload` are named re-exports rather than star
 * re-exports: `types.ts` declares them and `render.ts` / `classify.ts`
 * implement them, so two star exports would collide (TS2308) on the shared name.
 *
 * `src/generate.ts` does not exist in this tree yet. When that module lands, add
 * `export * from "./generate"` here.
 */

export * from "./types"
export * from "./loader"
export { renderPayload } from "./render"
export { classifyPayload } from "./classify"
