/**
 * STARTUP HOST
 *
 * what the application asks of the shell as it starts: the startup feature's port. `./tauri` is
 * its Tauri adapter, and `$lib/app/host` composes it into the application's `Host` under
 * `startup`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

import type { Recovery } from '$lib/update/host';

/** what startup may ask of the shell: the bootstrap, and what it had to recover to open. */
export type StartupHost = {
	bootstrap: () => Promise<Recovery>;
};
