import {
	writeExport,
	type ExportColumn,
	type ExportFormat,
	type ExportWriter
} from '@rentable/design/csv.js';
import { get } from 'svelte/store';

import { isolateDirection } from '$lib/error/message';
import { LL } from '$lib/i18n/i18n-svelte';
import { showErrorToast, showSuccessToast } from '$lib/notification';
import { tauri } from '$lib/platform/tauri';

/**
 * this application's answer to the three things an export cannot do for itself.
 *
 * The seam is here rather than in the package because choosing a path and putting bytes on it
 * is what a shell has and a package does not. Which command rather than which argument, on the
 * far side of it: the two differ in what lands on disk, and the text one prepends a
 * byte-order mark that would corrupt an archive.
 */
const writer: ExportWriter = {
	chooseFile: (suggested) => tauri.dialog.saveFile(suggested),
	writeText: (path, contents) => tauri.export.write(path, contents),
	writeWorkbook: (path, sheets) => tauri.export.writeWorkbook(path, sheets)
};

/**
 * LIST EXPORT
 *
 * A list written to a file: which rows were asked for, and the writing of them once the reader
 * has chosen the format.
 */
export class ListExport<TData> {
	isExporting = $state(false);
	/**
	 * What an export was asked for: which rows, and what to call the file.
	 *
	 * Taken at the moment a control is pressed rather than read again when the format is chosen.
	 * The list keeps moving behind the dialog, and a selection export that read the selection
	 * again at submit time could write a different set, or an empty file, than the one the reader
	 * asked for. `null` means no export is being asked about, which is also what closes the
	 * dialog.
	 */
	exporting = $state<{ rows: TData[]; name: string } | null>(null);

	/** The columns the list's `exportAs` names, or nothing where it offers no export. */
	#columns: () => ExportColumn<TData>[] | undefined;

	constructor(columns: () => ExportColumn<TData>[] | undefined) {
		this.#columns = columns;
	}

	/** Ask which file these rows become. */
	ask = (rows: TData[], name: string) => {
		this.exporting = { rows, name };
	};

	// written from what was captured rather than from a fresh read: the file is the rows the
	// reader asked for, under the search and the order the list was showing them under.
	write = async (format: ExportFormat) => {
		const columns = this.#columns();

		if (!columns || !this.exporting || this.isExporting) return;

		const asked = this.exporting;
		this.isExporting = true;

		try {
			const path = await writeExport(writer, {
				name: asked.name,
				format,
				columns,
				records: asked.rows
			});

			// where the file goes is the reader's, and walking away from that dialog is not a
			// failed export, because nothing was written and there is nothing to say about it.
			if (!path) {
				return;
			}

			// the path is isolated because it is written left to right whatever the sentence
			// around it is, and an unisolated one reorders the Arabic it is spliced into.
			showSuccessToast(get(LL).common.messages.exported({ path: isolateDirection(path) }));

			// a file manager that will not open is not a failed export: the file is written and
			// the user has been told where.
			await tauri.opener.revealItemInDir(path).catch(() => {});
		} catch (failure) {
			// the export is not a mutation, and what a refused command carries is `{ code,
			// message }` rather than an Error — so it is decoded rather than read as prose.
			showErrorToast(failure, get(LL));
		} finally {
			this.isExporting = false;
		}
	};
}
