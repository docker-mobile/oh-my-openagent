// Sidecar entry for the persisted recall terms and compiled memory blocks, bundled as extensions/omc-recall-store.js and imported through
// `#omc-recall-store-runtime` on the first corpus load (see ./recall-store-runtime-loader.ts).

export { CompiledBlockStore, RecallTermPersistence } from "@oh-my-cybersecurity/memory-core/recall-store"
// memory-core's `#memory-external-projection` (the <external_projection> renderer) maps here in the plugin manifest,
// so the compiled-block path loads one sidecar for both.
export { renderExternalProjection, renderExternalProjectionStats } from "@oh-my-cybersecurity/memory-core/external-projection"
