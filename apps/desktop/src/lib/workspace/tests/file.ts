// The file standing between the two halves of a workspace transfer, modelled for the tests.
//
// Not a `*.test.ts` file, so the runner does not pick it up directly. What it does is what the
// writer and the reader do between them: a sheet's cells go out as the kinds of thing they are,
// and come back as the text the reader hands over. Modelling that middle is the whole point —
// feeding the writer's output straight into the planning pass would test the two halves agreeing
// about an object rather than about a file.

import { toExportSheet, toSheetName } from '@rentable/design/csv.js';
import type { ExportCell, ExportSheet, ImportTable } from '$lib/platform/host.ts';
import {
	TRANSFER_COLUMNS,
	TRANSFER_CONCEPTS,
	type TransferConcept,
	toSheetTitle,
	type WorkspaceTransfer
} from '../workspace.ts';

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

// One concept's sheet, spelled out per concept rather than indexed by it: the columns and the
// records are two lookups into two objects, and nothing tells the compiler that one key picks the
// same concept from both. A switch says it once each and stays checked on both sides.
function toSheet(transfer: WorkspaceTransfer, concept: TransferConcept): ExportSheet {
	const title = toSheetTitle(concept);

	switch (concept) {
		case 'tenants':
			return toExportSheet(TRANSFER_COLUMNS.tenants, transfer.tenants, title);
		case 'complexes':
			return toExportSheet(TRANSFER_COLUMNS.complexes, transfer.complexes, title);
		case 'units':
			return toExportSheet(TRANSFER_COLUMNS.units, transfer.units, title);
		case 'contracts':
			return toExportSheet(TRANSFER_COLUMNS.contracts, transfer.contracts, title);
		case 'payments':
			return toExportSheet(TRANSFER_COLUMNS.payments, transfer.payments, title);
	}
}

/** A whole workspace as the tables a reader would hand back, one per sheet. */
export function toTables(transfer: WorkspaceTransfer): ImportTable[] {
	return TRANSFER_CONCEPTS.map((concept) => {
		const sheet = toSheet(transfer, concept);

		return {
			// the writer leaves a tab unnamed only where it was given no name, and every sheet here
			// is given one — a workspace file names each of its five. The fallback is what a reader
			// would be handed if that stopped being true, and it goes through the same sanitiser the
			// writer applies: a tab name the format refuses is not a name a reader could hand back.
			name: sheet.name ?? toSheetName(toSheetTitle(concept)),
			headers: sheet.headers,
			rows: sheet.rows.map((row) => row.map(toText))
		};
	});
}
