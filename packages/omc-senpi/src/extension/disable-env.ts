/**
 * `OMC_SENPI_DISABLED=1` loads the omc-senpi plugin without registering anything, like the
 * `--omc-senpi-disabled` flag. A memory child that must load extensions only for a provider
 * one of them registers (#9175) sets it through the environment, because the flag is an unknown
 * option to a child that happens not to load this plugin.
 */
export const OMC_SENPI_DISABLED_ENV = "OMC_SENPI_DISABLED"

export function isOmoSenpiDisabledByEnv(env: NodeJS.ProcessEnv): boolean {
  return env[OMC_SENPI_DISABLED_ENV] === "1"
}
