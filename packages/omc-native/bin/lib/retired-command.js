/** Old app-server invocations must never fall through into a model turn. */
export function refuseRetiredCommand(args) {
  if (args[0] !== "app-server") return false
  process.stderr.write("omc app-server has been removed. Use omc --mode rpc or omc host.\n")
  process.exitCode = 2
  return true
}
