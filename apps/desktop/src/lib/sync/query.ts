import { emitSessionEnded } from '$lib/sync/event';
import api from '$lib/api/caller';
import { announceReceivedRows, syncWorkspaceNow } from '$lib/sync/workspace';
import { declareMutation } from '$lib/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * The replica's state, under the settings prefix it has always been cached at: a whole-cache
 * invalidation and anything clearing the settings prefix clear it with the rest. It was
 * `settings/query.ts`'s until effort 840 (ticket 38).
 */
export const keys = {
	remoteSync: ['settings', 'remote-sync']
} as const;

/**
 * @param enabled whether to ask at all. It defaults to asking, and the one caller that passes
 * anything is the rail with nobody signed in: this call goes through a procedure, a procedure
 * needs an acting user, and asking who is signed in on a machine where nobody is would be a
 * refusal by design reported as a failure.
 */
export function useFetchRemoteSyncState(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: keys.remoteSync,
		queryFn: () => api.sync.getState(),
		enabled: enabled()
	}));
}

/**
 * reach the workspace's remote and keep this machine replicating.
 *
 * **What a person pressing Sync asks for is both halves**: the window renewed, and this machine's
 * writes offered and the others' taken.
 *
 * *It was `useSyncGoogleDriveWorkspace` and pushed or pulled a whole workspace. Drive sync retired
 * (decision 07), and the note that replaced it read "a replica pushes its own writes, so what a
 * person pressing Sync asks for is the one thing left — the window", which was true of no build:
 * `turso::sync` holds every write until something calls `push`.*
 */
export const useSyncWorkspace = declareMutation({
	mutate: () => syncWorkspaceNow(),
	touches: 'none',
	toast: {
		success: () => get(LL).settingsHooks.workspaceUpToDate(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	landed: async ({ result }, client) => {
		// the dispatch signed the member out on the Rust side, and there is no workspace for
		// this outcome to be about: the shell hears it and puts the wall up, and nothing here
		// announces a workspace that is closed (effort 826, requirement 22).
		if (result.standing === 'signedOutElsewhere') {
			emitSessionEnded();

			return false;
		}

		client.setQueryData(keys.remoteSync, result.state);
		await client.invalidateQueries({ queryKey: keys.remoteSync });

		// The pull brought another device's rows, so this is a writer of workspace data and has
		// to say so. Pressing Sync and being shown the statuses from before the sync is the
		// shape of an unannounced writer.
		if (result.received) {
			await announceReceivedRows(client);
		}
	},
	failed: async (_failure, client) => {
		await client.invalidateQueries({ queryKey: keys.remoteSync });
	}
});
