import { invoke } from '@tauri-apps/api/core';

import type { ExportSheet, ImportTable, TransferHost } from './host';

/**
 * import's and export's tauri commands: the transfer capability's port, satisfied by the Tauri
 * shell.
 *
 * **Every command name and argument shape is the Rust side's**, and they are spelled here exactly
 * as they were in the platform facade, where they sat until effort 840 gave transfer its own port.
 */
export const tauri = {
	export: {
		/**
		 * Write text to the path the user chose, and answer with where it landed.
		 *
		 * The path is theirs, from the platform's save dialog — symmetric with `import.read`,
		 * which is handed one from the open dialog. Where a file may go stopped being this
		 * layer's question, and Rust's, the moment the reader was asked.
		 */
		write: (path: string, contents: string) =>
			invoke<string>('plugin:transfer|export_write', { path, contents }),
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
			invoke<string>('plugin:transfer|export_write_workbook', { path, sheets })
	},
	import: {
		/**
		 * Read a file the user chose, as a table of text.
		 *
		 * Symmetric with `export.write`: both take a path the user picked through a platform
		 * dialog, never one the web layer composed. Which file to read and which file to write
		 * are the same question asked in two directions, and both are the reader's to answer.
		 *
		 * What comes back is strings. Which column means what, and whether a row is a record, are
		 * questions about tenants and contracts that the reader does not answer.
		 */
		read: (path: string) => invoke<ImportTable>('plugin:transfer|import_read', { path }),
		/**
		 * Read every sheet of a file the user chose.
		 *
		 * What a whole workspace arrives as. The tables come back in the file's own order and each
		 * says which sheet it is — the caller matches them by that name and never by position,
		 * because a reader who dragged the tabs about handed over the same workspace.
		 */
		readBook: (path: string) => invoke<ImportTable[]>('plugin:transfer|import_read_book', { path })
	}
} satisfies TransferHost;
