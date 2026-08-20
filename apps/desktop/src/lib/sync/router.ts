import type { RemoteSyncState } from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';

/**
 * SYNC ROUTER
 *
 * getting a workspace off this machine and back onto it, mounted by the app router at
 * `app.remoteSync`.
 *
 * *It carried a `backup` router beside this one, because backup and sync produced the same
 * snapshots. The backup surface retired with #569 and Turso holds the record, so there are no
 * snapshots for the two to have in common and only the window is left to ask about.*
 *
 * **`public`, and this is the one that is worth arguing.** It reads the shell's own record of what
 * this machine has synced — including whether anybody is signed in — so requiring an acting user
 * would make it answerable only to the machines whose answer is already known.
 */

export const remoteSync = router({
	getState: procedure.public.query(async ({ ctx }): Promise<RemoteSyncState> => {
		return ctx.host.remoteSync.getState();
	})
});
