import api from '$lib/api/caller';
import { tauri, type RemoteSyncState } from '$lib/platform/tauri';
import { syncWorkspaceBeforeExit } from '$lib/sync/workspace';
import { keys as syncKeys } from '$lib/sync/query';
import { declareMutation } from '$lib/mutation';

/**
 * THE UPDATER'S HOOKS
 *
 * Whether a newer release exists, preparing the workspace for its installer, and the restart
 * that follows. None of them writes a key: an update is this installation's business, and what
 * the settings page shows of it is its own state. They were `settings/query.ts`'s until effort
 * 840 (ticket 38).
 */

/** ask the updater whether a newer release exists. resolves to `null` when none does. */
export const useCheckForUpdate = declareMutation({
	mutate: () => tauri.update.check(),
	touches: 'none'
});

/** put the workspace in a state an installer may replace the binary from. */
export const usePrepareUpdate = declareMutation({
	mutate: ({ targetVersion }: { targetVersion: string }) => api.update.prepare({ targetVersion }),
	touches: 'none'
});

/**
 * push the workspace to the remote, then restart.
 *
 * the push reads the remote state already in the cache rather than subscribing
 * to it: a caller that only restarts should not hold a live query open for the
 * whole time it is on screen.
 */
export const useRestartApp = declareMutation({
	mutate: async (_: void, { client }) => {
		await syncWorkspaceBeforeExit(client.getQueryData<RemoteSyncState>(syncKeys.remoteSync));
		await tauri.window.restart();
	},
	touches: 'none'
});
