// The file standing between the two halves of a workspace transfer, modelled for the tests.
//
// Not a `*.test.mjs` file, so the runner does not pick it up directly. What it does is what the
// writer and the reader do between them: a sheet's cells go out as the kinds of thing they are,
// and come back as the text the reader hands over. Modelling that middle is the whole point —
// feeding the writer's output straight into the planning pass would test the two halves agreeing
// about an object rather than about a file.

import { toExportSheet } from '$lib/design/csv.ts';
import { TRANSFER_COLUMNS, TRANSFER_CONCEPTS, toSheetTitle } from './workspace.ts';

// what `to_text` in the Rust reader answers for each kind of cell.
function toText(cell) {
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

/** A whole workspace as the tables a reader would hand back, one per sheet. */
export function toTables(transfer) {
	return TRANSFER_CONCEPTS.map((concept) => {
		const sheet = toExportSheet(
			TRANSFER_COLUMNS[concept],
			transfer[concept],
			toSheetTitle(concept)
		);

		return {
			name: sheet.name,
			headers: sheet.headers,
			rows: sheet.rows.map((row) => row.map(toText))
		};
	});
}
