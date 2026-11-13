import { runServiceAuthCommand as runAccountsCommand } from "../omc-opencode/src/cli/service-auth/commands"
import { cliDeviceServiceHandoff } from "./device-service-handoff"

/** `omc login|logout|whoami` with this machine's device service told about each sign-in and sign-out. */
export const runServiceAuthCommand = (args: readonly string[]): Promise<void> =>
  runAccountsCommand(args, { deviceService: api => cliDeviceServiceHandoff({ api, log: line => process.stderr.write(`${line}\n`) }) })
