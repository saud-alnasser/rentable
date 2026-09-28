/**
 * UPDATE HOST
 *
 * what the updater asks of the shell it runs in, and the payload types it speaks in: the update
 * feature's port. `./tauri` is its Tauri adapter, and `$lib/app/host` composes it into the
 * application's `Host` under `update`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

/**
 * the route back from a version that will not run.
 *
 * *The protected snapshot and the fields naming it went with the backup surface (#569). The
 * record of truth is in Turso, so a failed update costs no data and there is nothing to restore;
 * what a user still needs is the release they came from, which is all this carries now.*
 */
export type Recovery = {
	targetVersion: string;
	previousVersion: string;
	updateError: string | null;
	status: 'pending' | 'obsolete';
	previousReleaseUrl: string;
};

export type AvailableUpdate = {
	currentVersion: string;
	version: string;
	date: string | null;
	body: string | null;
	rawJson: Record<string, unknown>;
	downloadAndInstall: (onEvent?: (event: UpdaterDownloadEvent) => void) => Promise<void>;
	close: () => Promise<void>;
};

/**
 * how far a download has got.
 *
 * Spelled out rather than aliased to the updater plugin's own type, so that reading this port
 * does not require that plugin. It is the same shape, and `mapUpdate` in the adapter is where
 * the compiler checks that it still is.
 */
export type UpdaterDownloadEvent =
	| { event: 'Started'; data: { contentLength?: number } }
	| { event: 'Progress'; data: { chunkLength: number } }
	| { event: 'Finished' };

/** what the updater may ask of the shell: whether a newer release exists, and making way for it. */
export type UpdateHost = {
	prepare: (targetVersion: string) => Promise<Recovery>;
	check: () => Promise<AvailableUpdate | null>;
};
