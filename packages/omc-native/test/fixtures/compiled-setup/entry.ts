import { runCompiledLauncher } from "../../../compile-entry"

const runtimeRoot = process.env.OMC_COMPILED_SETUP_RUNTIME_ROOT
if (runtimeRoot === undefined) throw new Error("OMC_COMPILED_SETUP_RUNTIME_ROOT is required")
await runCompiledLauncher(process.argv.slice(2), runtimeRoot, "fixture", runtimeRoot)
