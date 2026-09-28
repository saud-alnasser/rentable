import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import {
	openUrl as openExternalUrl,
	revealItemInDir as revealInFileManager
} from '@tauri-apps/plugin-opener';

import type { DiagnosticRecord, PlatformHost } from '$lib/platform/host';
import { withExtension } from '$lib/platform/path';

/**
 * The payload type belongs to the port rather than to this implementation of it, and is
 * re-exported because the rest of the application already reaches for it here. A feature's
 * payload types are its own, in its `host.ts`.
 *
 * `PlatformHost` itself is deliberately not among them. Re-exporting it would put the port back
 * behind the facade, and a second client kind reaching it that way would pull every
 * `@tauri-apps` package into its graph to read one type — which is the thing the separate
 * module exists to prevent.
 */
export type { DiagnosticRecord } from '$lib/platform/host';

/**
 * the platform's tauri commands: what is no feature's. Each feature that crosses to Rust has its
 * own adapter in its `tauri.ts`, and `$lib/app/host` composes them.
 */
export const tauri = {
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
		write: (record: DiagnosticRecord) => invoke<void>('diagnostics_write', { record }),
		/**
		 * The folder the diagnostics file is kept in, as the settings the shell holds report it.
		 * The same command settings read their file with (`$lib/settings/tauri`), asked for this
		 * one field, because the screens that open the folder are no feature's.
		 */
		directory: async () => (await invoke<{ diagnosticsDir: string }>('settings_get')).diagnosticsDir
	}
} satisfies PlatformHost;
