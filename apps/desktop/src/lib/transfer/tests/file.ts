// The file standing between the two halves of a workspace transfer, modelled for the tests.
//
// Not a `*.test.ts` file, so the runner does not pick it up directly. What it does is what the
// writer and the reader do between them: a sheet's cells go out as the kinds of thing they are,
// and come back as the text the reader hands over. Modelling that middle is the whole point —
// feeding the writer's output straight into the planning pass would test the two halves agreeing
// about an object rather than about a file.
//
// It binds the sheets every feature declares, as the root layout does, so a test importing it
// reads and writes files with the sheets the application has.

import '$lib/app/transfer.ts';
import { toSheetName } from '@rentable/design/csv.js';
import type { ExportCell, ExportSheet, ImportTable } from '$lib/platform/host.ts';
import { toWorkbook, type WorkspaceTransfer } from '$lib/transfer/index.ts';

// what `to_text` in the Rust reader answers for each kind of cell.
function toText(cell: ExportCell) {
	switch (cell.kind) {
		case 'empty':
			return '';
		case 'date':
			// the reader spells a date cell as the day, never as the count of days the format
			// stores one as.
			return new Date(Date.UTC(1899, 11, 30) + cell.value * 86_400_000).toISOString().slice(0, 10);
		case 'text':
			return cell.value;
		default:
			return String(cell.value);
	}
}

/** Sheets as written, as the tables a reader would hand back: each cell spelled as text. */
export function readBack(sheets: readonly ExportSheet[]): ImportTable[] {
	return sheets.map((sheet, index) => ({
		// the writer leaves a tab unnamed only where it was given no name, and every sheet of a
		// workspace file is given one. The fallback is what a reader would be handed if that
		// stopped being true, and it goes through the same sanitiser the writer applies: a tab name
		// the format refuses is not a name a reader could hand back.
		name: sheet.name ?? toSheetName(`Sheet${index + 1}`),
		headers: sheet.headers,
		rows: sheet.rows.map((row) => row.map(toText))
	}));
}

/** A whole workspace as the tables a reader would hand back, one per sheet. */
export function toTables(transfer: WorkspaceTransfer): ImportTable[] {
	return readBack(toWorkbook(transfer));
}
