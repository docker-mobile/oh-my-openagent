type Env = Readonly<Record<string, string | undefined>>

/** The reinstall clause for a missing plugin file: the omc-ai launcher's exact command (`OMC_REINSTALL_COMMAND`) when it set one. */
export function reinstallStep(env: Env = process.env): string {
  const command = env.OMC_REINSTALL_COMMAND?.trim()
  return command ? `reinstall omc with: ${command}` : "reinstall omc"
}
