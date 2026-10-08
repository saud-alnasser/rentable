/**
 * UPDATE HOST
 *
 * what the updater asks of the shell it runs in, and the payload types it speaks in: the update
 * feature's port. `./tauri` is its Tauri adapter, and `$lib/app/host` composes it into the
 * application's `Host` under `update`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 *
 * **The updater runs in Rust** (effort 857, ticket 09): a check, a download whose bytes the shell
 * holds, and an install that writes the route back, installs and starts the new version. The
 * window holds no handle on a release, only what the shell said of it.
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

/** a release this installation could move to, as the shell's check found it. */
export type AvailableUpdate = {
	currentVersion: string;
	version: string;
	/** the manifest's publication date, as it was published. */
	date: string | null;
	body: string | null;
	rawJson: Record<string, unknown>;
};

/**
 * What a check found.
 *
 * **No release is an answer, not a failure.** Offline is a `network` error and anything else an
 * error of its own code, both thrown, so a caller tells the three apart by the outcome and the code.
 */
export type CheckedUpdate = ({ outcome: 'available' } & AvailableUpdate) | { outcome: 'noRelease' };

/** how far a download has got: the bytes so far and, where the server said, of how many. */
export type UpdateProgress = {
	version: string;
	downloaded: number;
	contentLength: number | null;
};

/** the release a download finished with, held by the shell until it is installed. */
export type FetchedUpdate = { version: string };

/** what the updater may ask of the shell. */
export type UpdateHost = {
	/** write the route back before an install. Install does this itself now; kept for the router. */
	prepare: (targetVersion: string) => Promise<Recovery>;
	/** whether a newer release exists. */
	check: () => Promise<CheckedUpdate>;
	/** download the release the last check found, reporting each chunk. */
	download: (onProgress: (progress: UpdateProgress) => void) => Promise<FetchedUpdate>;
	/**
	 * install the downloaded release and start it. On Windows the installer exits the process, and
	 * elsewhere the shell restarts, so a success never resolves in a running window.
	 */
	install: () => Promise<void>;
};
