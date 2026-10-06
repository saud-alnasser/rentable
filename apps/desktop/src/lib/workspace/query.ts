import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { settingsKeys } from '$lib/settings';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

/**
 * WORKSPACE QUERIES
 *
 * the one mutation a whole-workspace transfer makes, and settling the offer of the earlier
 * version's records. The workspace's rename is the organization's, whose database holds the name
 * (`organization/workspace/query.ts`).
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
