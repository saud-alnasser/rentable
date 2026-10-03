/**
 * The webview's remote debugging port, which the development launch opens and the seed reaches.
 *
 * **Development only.** The seed fills the organization by calling the running app's own commands
 * (`./organization.ts` says why no script can write those rows), and the debug port is the one way
 * in from outside the window. So `dev` opens it and `build` never does: a shipped build with a
 * debugging port open would hand the window to anything on the machine.
 *
 * **Windows only, because the webview is.** WebView2 reads extra browser arguments from
 * `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`; WKWebView (macOS) and WebKitGTK (Linux) have no such port,
 * and the seed says so there rather than trying.
 */

/** the port both sides agree on, `RENTABLE_DEBUG_PORT` where set and 9222 otherwise. */
export function debugPort(env = process.env) {
	const port = Number(env.RENTABLE_DEBUG_PORT);

	return Number.isInteger(port) && port > 0 ? port : 9222;
}

/**
 * The environment a `tauri <args>` launch runs under: `env` itself, with the debug port added for
 * `dev` on Windows. A port already named in the webview's arguments is left as it is.
 *
 * @param {string[]} args the Tauri CLI's arguments, `dev` or `build` first
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function launchEnvironment(args, platform, env) {
	if (args[0] !== 'dev' || platform !== 'win32') {
		return env;
	}

	const existing = env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ?? '';

	if (existing.includes('--remote-debugging-port')) {
		return env;
	}

	const argument = `--remote-debugging-port=${debugPort(env)}`;

	return {
		...env,
		WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: existing ? `${existing} ${argument}` : argument
	};
}
