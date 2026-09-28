import { invoke } from '@tauri-apps/api/core';

import type { EarlierRead, EarlierRecords, WorkspaceHost } from './host';

/**
 * the workspace's tauri commands: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's**, and they are spelled here exactly
 * as they were in the platform facade, where they sat until effort 840 gave the workspace its own
 * port.
 */
export const tauri = {
	earlier: {
		/**
		 * Whether this machine's `app.db` holds the records of 0.12.0 or 0.13.0, and which.
		 *
		 * Those releases kept every record in that one file, and this build never reads it; the
		 * file is opened read-only and never created (`tauri/src/upgrade/record.rs`).
		 */
		find: () => invoke<EarlierRecords | null>('earlier_find'),
		/**
		 * Read those records as the whole-workspace export, and write them as its workbook under
		 * `backups/app/`.
		 *
		 * The tables are that workbook read back, so the workspace import is handed exactly what it
		 * would be had the person chosen the file themselves.
		 */
		read: () => invoke<EarlierRead>('earlier_read')
	}
} satisfies WorkspaceHost;
