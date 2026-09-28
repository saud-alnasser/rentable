/**
 * TRANSFER HOST
 *
 * what import and export ask of the shell they run in, and the payload types they speak in: the
 * transfer capability's port. `./tauri` is its Tauri adapter, and `$lib/app/host` composes it
 * into the application's `Host` under `transfer`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

/**
 * One cell of a workbook, as the kind of thing it is.
 *
 * Money and dates cross as figures rather than as the text a surface drew, because the file's
 * reader is a spreadsheet: it renders a number in whatever locale the person opening it works
 * in, and can do nothing with a string that merely looks like one. `date` is the count of days
 * the format itself counts in.
 */
export type ExportCell =
	| { kind: 'text'; value: string }
	| { kind: 'number'; value: number }
	| { kind: 'date'; value: number }
	| { kind: 'money'; value: number }
	| { kind: 'empty' };

/** One sheet of a workbook: its headings, and its rows under them. */
export type ExportSheet = {
	/**
	 * what the tab is called.
	 *
	 * Left out where the workbook holds one sheet — there is nothing to tell it apart from.
	 * Given where it holds several, which is how a reader finds the tenants inside a workspace.
	 */
	name?: string;
	headers: string[];
	rows: ExportCell[][];
};

/** A file read back in: the heading row, and the rows under it, all as text. */
export type ImportTable = {
	/** the sheet it came off, or the file's own name where the format has no sheets. */
	name: string;
	headers: string[];
	rows: string[][];
};

/** what import and export may ask of the shell: writing a file the user chose, and reading one. */
export type TransferHost = {
	export: {
		/**
		 * Write text to the path the user chose, and answer with where it landed.
		 *
		 * The path is theirs, from the platform's save dialog — symmetric with `import.read`,
		 * which is handed one from the open dialog. Where a file may go is not this layer's
		 * question.
		 */
		write: (path: string, contents: string) => Promise<string>;
		/**
		 * Write a workbook to the path the user chose, and answer with where it landed.
		 *
		 * The cells cross as the kinds of thing they are — a count as a count, a day as a day —
		 * and this side spells each one. A figure rendered before it crossed could not be added
		 * up by whatever opened the file, and carried a locale that file's reader never chose.
		 */
		writeWorkbook: (path: string, sheets: ExportSheet[]) => Promise<string>;
	};
	import: {
		/**
		 * Read a file the user chose, as a table of text.
		 *
		 * What comes back is strings. Which column means what, and whether a row is a record, are
		 * questions about tenants and contracts that the reader does not answer.
		 */
		read: (path: string) => Promise<ImportTable>;
		/**
		 * Read every sheet of a file the user chose.
		 *
		 * What a whole workspace arrives as. The tables come back in the file's own order and each
		 * says which sheet it is — the caller matches them by that name and never by position,
		 * because a reader who dragged the tabs about handed over the same workspace.
		 */
		readBook: (path: string) => Promise<ImportTable[]>;
	};
};
