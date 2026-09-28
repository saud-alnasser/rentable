/**
 * WORKSPACE HOST
 *
 * what the workspace asks of the shell it runs in, and the payload types it speaks in: the
 * workspace feature's port, which is the reading of the records an earlier version left in
 * `app.db` (`./app-database`). `./tauri` is its Tauri adapter, and `$lib/app/host` composes it
 * into the application's `Host` under `workspace`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

import type { ImportTable } from '$lib/transfer/host';

/**
 * A release before organizations that kept every record in `app.db`, named as the release was.
 * 0.12.0 left the file at workspace schema 2, and 0.13.0 at schema 3.
 */
export type EarlierVersion = '0.12.0' | '0.13.0';

/** The records of an earlier version, found in `app.db`. */
export type EarlierRecords = {
	version: EarlierVersion;
};

/** The records of an earlier version, read as the whole-workspace export. */
export type EarlierRead = {
	version: EarlierVersion;
	/** where the export's workbook was written, which is the copy the person keeps. */
	path: string;
	/** that workbook's sheets, as `import.readBook` hands over a file the person chose. */
	tables: ImportTable[];
};

/** what the workspace may ask of the shell: the records an earlier version left behind. */
export type WorkspaceHost = {
	earlier: {
		/**
		 * Whether this machine's `app.db` holds the records of 0.12.0 or 0.13.0, and which, or
		 * nothing. The file is opened read-only and never created.
		 */
		find: () => Promise<EarlierRecords | null>;
		/**
		 * Read those records as the whole-workspace export, write them as its workbook under
		 * `backups/app/`, and hand back that workbook's sheets for the workspace import to plan
		 * over. Nothing is written to `app.db`; a file holding no such records is refused.
		 */
		read: () => Promise<EarlierRead>;
	};
};
