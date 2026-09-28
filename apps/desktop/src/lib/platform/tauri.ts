import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import {
	openUrl as openExternalUrl,
	revealItemInDir as revealInFileManager
} from '@tauri-apps/plugin-opener';
import { check, type Update as TauriUpdate } from '@tauri-apps/plugin-updater';

import type {
	AvailableUpdate,
	DiagnosticRecord,
	EarlierRead,
	EarlierRecords,
	ExportSheet,
	ImportTable,
	PlatformHost,
	Recovery,
	RemoteSyncState,
	ReplicationRefusal,
	SessionStanding,
	Settings,
	SettingsChangeset
} from '$lib/platform/host';
import { withExtension } from '$lib/platform/path';

/**
 * The payload types belong to the port rather than to this implementation of it, and are
 * re-exported because the rest of the application already reaches for them here.
 *
 * `PlatformHost` itself is deliberately not among them. Re-exporting it would put the port back
 * behind the facade, and a second client kind reaching it that way would pull every
 * `@tauri-apps` package into its graph to read one type — which is the thing the separate
 * module exists to prevent.
 */
export type {
	AvailableUpdate,
	DiagnosticRecord,
	EarlierRead,
	EarlierRecords,
	EarlierVersion,
	ExportCell,
	ExportSheet,
	ImportTable,
	Recovery,
	RemoteSyncState,
	RemoteSyncWorkspace,
	ReplicationRefusal,
	SessionStanding,
	Settings,
	SettingsChangeset,
	UpdaterDownloadEvent
} from '$lib/platform/host';

function mapUpdate(update: TauriUpdate): AvailableUpdate {
	return {
		currentVersion: update.currentVersion,
		version: update.version,
		date: update.date ?? null,
		body: update.body ?? null,
		rawJson: update.rawJson,
		downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
		close: () => update.close()
	};
}

/**
 * any tauri commands that are available to the API.
 */
export const tauri = {
	bootstrap: () => invoke<Recovery>('bootstrap'),
	window: {
		show: () => invoke<void>('window_show'),
		hide: () => invoke<void>('window_hide'),
		minimize: () => invoke<void>('window_minimize'),
		maximize: () => invoke<void>('window_maximize'),
		drag: () => invoke<void>('window_drag'),
		close: () => invoke<void>('window_close'),
		restart: () => invoke<void>('window_restart')
	},
	opener: {
		openUrl: (url: string) => openExternalUrl(url),
		revealItemInDir: (path: string) => revealInFileManager(path)
	},
	print: {
		/**
		 * Print what the window's print sheet holds: to paper through the operating system's
		 * dialog, or to the PDF file at `path`, which on Windows is written with no dialog at all.
		 */
		page: (
			request: ({ mode: 'print' } | { mode: 'pdf'; path: string }) & {
				page?: { head: string; lang: string; dir: string; body: string };
			}
		) => invoke<void>('print_page', request)
	},
	export: {
		/**
		 * Write text to the path the user chose, and answer with where it landed.
		 *
		 * The path is theirs, from the save dialog below — symmetric with `import.read`, which
		 * is handed one from the open dialog. Where a file may go stopped being this layer's
		 * question, and Rust's, the moment the reader was asked.
		 */
		write: (path: string, contents: string) => invoke<string>('export_write', { path, contents }),
		/**
		 * Write a workbook to the path the user chose, and answer with where it landed.
		 *
		 * The cells cross as the kinds of thing they are — a count as a count, a day as a day —
		 * and this side spells each one. A figure rendered before it crossed could not be added
		 * up by whatever opened the file, and carried a locale that file's reader never chose.
		 *
		 * A second command rather than a format argument on the one above, because the two
		 * differ in what they put on disk rather than in what they are asked for: the text one
		 * prepends a byte-order mark, and a workbook is an archive that three bytes in front of
		 * would corrupt.
		 */
		writeWorkbook: (path: string, sheets: ExportSheet[]) =>
			invoke<string>('export_write_workbook', { path, sheets })
	},
	import: {
		/**
		 * Read a file the user chose, as a table of text.
		 *
		 * Symmetric with `export.write`: both take a path the user picked through a dialog below,
		 * never one the web layer composed. Which file to read and which file to write are the
		 * same question asked in two directions, and both are the reader's to answer.
		 *
		 * What comes back is strings. Which column means what, and whether a row is a record, are
		 * questions about tenants and contracts that the reader does not answer.
		 */
		read: (path: string) => invoke<ImportTable>('import_read', { path }),
		/**
		 * Read every sheet of a file the user chose.
		 *
		 * What a whole workspace arrives as. The tables come back in the file's own order and each
		 * says which sheet it is — the caller matches them by that name and never by position,
		 * because a reader who dragged the tabs about handed over the same workspace.
		 */
		readBook: (path: string) => invoke<ImportTable[]>('import_read_book', { path })
	},
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
	},
	dialog: {
		/**
		 * Ask the user for a file, answering its path or nothing where they walked away.
		 *
		 * The formats offered are the ones the export writes, because the file this reads is
		 * meant to be the file it produced.
		 */
		openFile: async () => {
			const chosen = await openFileDialog({
				multiple: false,
				directory: false,
				filters: [{ name: 'spreadsheet', extensions: ['csv', 'xlsx', 'xls', 'xlsm'] }]
			});

			return typeof chosen === 'string' ? chosen : null;
		},
		/**
		 * Ask the user for an image, answering its path or nothing where they walked away: the
		 * organization's mark, which the host reads from there and checks by its bytes.
		 */
		openImage: async () => {
			const chosen = await openFileDialog({
				multiple: false,
				directory: false,
				filters: [{ name: 'image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
			});

			return typeof chosen === 'string' ? chosen : null;
		},
		/**
		 * Ask the user where a file goes, answering its path or nothing where they walked away.
		 *
		 * The mirror of `openFile`, and the reason an export no longer decides for itself. The
		 * name the caller composed is what the dialog opens on, so a reader with no opinion
		 * presses one control; the extension it already carries decides the filter, because the
		 * format was chosen before this was asked.
		 *
		 * The extension is put back where the platform's dialog let the reader take it off. It
		 * is not the file's format — which command wrote it is — so a workbook named `.txt` is
		 * still a workbook, and it is a workbook nothing on the reader's machine will open.
		 */
		saveFile: async (defaultName: string) => {
			const extension = defaultName.split('.').pop() ?? '';
			const chosen = await saveFileDialog({
				defaultPath: defaultName,
				filters: extension ? [{ name: extension, extensions: [extension] }] : []
			});

			return typeof chosen === 'string' ? withExtension(chosen, extension) : null;
		}
	},
	diagnostics: {
		write: (record: DiagnosticRecord) => invoke<void>('diagnostics_write', { record })
	},
	update: {
		prepare: (targetVersion: string) => invoke<Recovery>('update_prepare', { targetVersion }),
		check: async () => {
			const update = await check();

			return update ? mapUpdate(update) : null;
		}
	},
	settings: {
		get: () => invoke<Settings>('settings_get'),
		set: (changeset: SettingsChangeset) => invoke<Settings>('settings_set', { changeset })
	},
	remoteSync: {
		getState: () => invoke<RemoteSyncState>('remote_sync_state_get'),
		replicate: () =>
			invoke<{
				pushed: boolean;
				received: boolean;
				refusal: ReplicationRefusal;
				standing: SessionStanding;
			}>('remote_sync_replicate'),
		push: () => invoke<boolean>('remote_sync_push'),
		renameWorkspace: (name: string) =>
			invoke<RemoteSyncState>('remote_sync_rename_workspace', { name })
	}
} satisfies PlatformHost;
