/**
 * SETTINGS HOST
 *
 * what settings ask of the shell they run in, and the payload types they speak in: the settings
 * feature's port. `./tauri` is its Tauri adapter, and `$lib/app/host` composes it into the
 * application's `Host` under `settings`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

import type { AppearanceSetting } from '$lib/platform/appearance';

export type Settings = {
	endingSoonNoticeDays: number;
	databasePath: string;
	diagnosticsDir: string;
	locale: string | null;
	/** light, dark, or following the system; a file written before it existed reads as system. */
	appearance: AppearanceSetting;
	version: string;
	/**
	 * whether the records an earlier version left on this machine were brought in or put aside,
	 * so they are offered no more. A file written before it existed reads as not yet.
	 */
	earlierRecordsSettled: boolean;
};

export type SettingsChangeset = {
	endingSoonNoticeDays?: number;
	locale?: string;
	appearance?: AppearanceSetting;
	earlierRecordsSettled?: boolean;
};

/** what settings may ask of the shell: the settings file, read and written. */
export type SettingsHost = {
	get: () => Promise<Settings>;
	set: (changeset: SettingsChangeset) => Promise<Settings>;
};
