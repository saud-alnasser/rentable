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
 * Write a whole workspace, in one batch.
 *
 * **It declares no inverse, and that is a decision rather than an omission.** Undo is a session
 * stack of inverses replayed through the real procedures ([[rules/data]], under *Undo*), and the
 * inverse of a workspace-sized write is thousands of deletions issued in an order the schema
 * allows — which is not a thing to hang off a toast that disappears in eight seconds. A
 * workspace handed over is not a change taken back; it is undone by restoring a backup, which
 * is what the group above this one on the settings screen exists for.
 */
export const useImportWorkspace = declareMutation({
	mutate: (transfer: Parameters<typeof api.workspace.importWhole>[0]) =>
		api.workspace.importWhole(transfer),
	touches: ['tenants', 'complexes', 'units', 'contracts', 'payments'],
	toast: {
		success: () => get(LL).settings.transferImportSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
