import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { settingsKeys } from '$lib/settings';
import { syncKeys } from '$lib/sync/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

/**
 * WORKSPACE QUERIES
 *
 * the one mutation a whole-workspace transfer makes, the workspace's rename, and settling the
 * offer of the earlier version's records.
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
 * It touches every concept even where the file held one: reconciliation runs over what was
 * written, and a file of payments moves the contracts they are against and the units those
 * contracts hold.
 *
 * **It declares no inverse, and that is a decision rather than an omission.** Undo is a session
 * stack of inverses replayed through the real procedures ([[rules/data]], under *Undo*), and the
 * inverse of a file's worth of records is thousands of deletions issued in an order the schema
 * allows — which is not a thing to hang off a toast that disappears in eight seconds. A file
 * imported is not a change taken back, and since #569 there is nothing in the application that
 * takes it back either: the record of truth is in Turso, whose point-in-time restore belongs to
 * whoever administers the account rather than to this screen.
 */
export const useImportRecords = declareMutation({
	mutate: (transfer: Parameters<typeof api.transfer.importWhole>[0]) =>
		api.transfer.importWhole(transfer),
	touches: 'every',
	toast: {
		success: () => get(LL).settings.transferImportSuccess(),
		// every failure is said by the dialog that asked for the import, which catches the
		// rejection and raises it once, as it does for a file that could not be read. The handler
		// saying it too was a second toast for one failure, a permission failure included.
		error: () => null
	}
});

/**
 * Call this machine's workspace something else.
 *
 * **It refreshes the replica's state rather than a workspace key.** The sidebar header, the
 * workspace menu and the workspace page all draw the name from the one query `sync/query.ts`
 * holds, so one invalidation of that key covers all three. It sat beside `useSyncWorkspace` in
 * `settings/query.ts` for that reason until effort 840 (ticket 38).
 *
 * The refusal is the shared handler's: the procedure's own bound raises `BAD_REQUEST`, which
 * reaches the reader as the message it was raised with, and anything else reads as an unexpected
 * failure. What a reader actually meets for a name that is empty or too long is the form's own
 * validation, on the field they typed in, before any of this runs.
 */
export const useRenameWorkspace = declareMutation({
	mutate: ({ name }: { name: string }) => api.sync.rename({ name }),
	touches: 'none',
	toast: {
		success: () => get(LL).workspace.renamed(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	// written before the invalidation as well as after it: the three surfaces drawing the name are
	// on screen while this resolves, and the refetch is a round trip they would otherwise spend
	// showing the old one.
	sets: ({ result }) => [{ key: syncKeys.remoteSync, data: result }],
	invalidates: [syncKeys.remoteSync]
});

/**
 * Offer the earlier version's records no more on this machine: they were brought in, or the
 * person put them aside (effort 838, requirement 18). The offer is read in `app-database.ts`.
 *
 * Says nothing on success: the offer going is what the person sees. A write the shell refuses is
 * said through the shared handler, and the offer stays.
 */
export const useSettleEarlierRecords = declareMutation({
	mutate: () => api.settings.set({ earlierRecordsSettled: true }),
	touches: 'none',
	toast: {
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	sets: ({ result }) => [{ key: settingsKeys.settings, data: result }],
	invalidates: [settingsKeys.settings]
});
