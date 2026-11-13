// Sidecar entry for /palace and /people, bundled as extensions/omc-memory-palace.js and imported
// through `#omc-memory-palace-runtime` on first use (see runtime-loader.ts).

export { runPalaceCommand } from "./command-runtime"
export { runPeopleCommand } from "../commands/people-runtime"
