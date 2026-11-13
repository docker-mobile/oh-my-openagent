/**
 * Detect whether we are running inside cmux (cmux omc).
 * When cmux-omc sets up the environment it injects a tmux shim and sets
 * CMUX_SOCKET_PATH / TMUX. If detected, redirect tmux commands to
 * `cmux __tmux-compat` so they become native cmux splits instead of
 * failing because there is no real tmux server running.
 */
export function isCmuxCompatEnvironment(
	environment: Record<string, string | undefined> = process.env,
): boolean {
	const tmuxEnvironment = environment.TMUX
	return tmuxEnvironment?.includes("cmuxterm") === true ||
		tmuxEnvironment?.includes("cmux-omc") === true ||
		(Boolean(environment.CMUX_SOCKET_PATH) && !tmuxEnvironment)
}
