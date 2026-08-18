import api from '$lib/api/caller';
import { declareMutation } from '$lib/design/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

/**
 * WORKSPACE QUERIES
 *
 * the one mutation a whole-workspace transfer makes.
 *
 * The read half is not here. An export is a single moment's read of everything, asked for by a
 * press and never rendered — caching it would hold a whole workspace in memory for a file the
 * reader has already saved. It is called directly by the surface that writes the file.
 */

/**
 * Write the records of a file, in one batch.
 *
 * One declaration for one procedure, whatever opened the file: settings hands it five sheets and
 * a directory hands it one, and what the reader is told is the same sentence about the same act.
 * A second declaration differing only in that sentence is the near-identical pair
 * ([[rules/data]], under *Mutation declaration*) exists to prevent.
 *
 * It touches all five concepts even where the file held one: reconciliation runs over what was
 * written, and a file of payments moves the contracts they are against and the units those
 * contracts hold.
 *
 * **It declares no inverse, and that is a decision rather than an omission.** Undo is a session
 * stack of inverses replayed through the real procedures ([[rules/data]], under *Undo*), and the
 * inverse of a file's worth of records is thousands of deletions issued in an order the schema
 * allows — which is not a thing to hang off a toast that disappears in eight seconds. A file
 * imported is not a change taken back; it is undone by restoring a backup, which is what the
 * group above the transfer on the settings screen exists for.
 */
export const useImportRecords = declareMutation({
	mutate: (transfer: Parameters<typeof api.workspace.importWhole>[0]) =>
		api.workspace.importWhole(transfer),
	touches: ['tenants', 'complexes', 'units', 'contracts', 'payments'],
	toast: {
		success: () => get(LL).settings.transferImportSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
