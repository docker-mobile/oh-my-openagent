import { runSenpiInstaller } from "@oh-my-cybersecurity/omc-senpi/install"

export type NativeDevInstallOptions = NonNullable<Parameters<typeof runSenpiInstaller>[0]>
export type NativeDevInstallResult = Awaited<ReturnType<typeof runSenpiInstaller>>

export async function runNativeDevInstaller(
  options?: NativeDevInstallOptions,
): Promise<NativeDevInstallResult> {
  return runSenpiInstaller(options)
}
