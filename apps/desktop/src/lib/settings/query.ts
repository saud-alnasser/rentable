import api from '$lib/api/caller';
import { tauri, type RemoteSyncState } from '$lib/platform/tauri';
import { syncWorkspaceBeforeExit, syncWorkspaceNow } from '$lib/sync/workspace';
import { invalidateRoot } from '$lib/design/query';
import { inverseStack } from '$lib/design/inverse';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { keys as dashboardKeys } from '$lib/dashboard/query';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { get } from 'svelte/store';

export const keys = {
	all: ['settings'],
	settings: ['settings', 'data'],
	backups: ['settings', 'backups'],
	remoteSync: ['settings', 'remote-sync']
} as const;

export function useFetchSettings() {
	return createQuery(() => ({
		queryKey: keys.settings,
		queryFn: () => api.app.settings.get()
	}));
}

export function useFetchBackups() {
	return createQuery(() => ({
		queryKey: keys.backups,
		queryFn: () => api.app.backup.list()
	}));
}

export function useFetchRemoteSyncState() {
	return createQuery(() => ({
		queryKey: keys.remoteSync,
		queryFn: () => api.app.remoteSync.getState()
	}));
}

export function useSetEndingSoonNoticeDays(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.endingSoonUpdated(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ days }: { days: number }) =>
			api.app.settings.set({ endingSoonNoticeDays: days }),
		onSuccess: async (settings) => {
			client.setQueryData(keys.settings, settings);

			await Promise.all([
				client.invalidateQueries({ queryKey: keys.settings }),
				// the prefix, so the screen is refreshed whichever period it is currently showing.
				client.invalidateQueries({ queryKey: dashboardKeys.all })
			]);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useCreateBackup(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.backupCreated(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.app.backup.create(),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.backups });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteBackup(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.backupDeleted(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ filename }: { filename: string }) => api.app.backup.delete({ filename }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.backups });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useRestoreBackup(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.backupRestored(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		// the inverses go with the database they were statements about: a restore replaces the
		// workspace, so replaying one there would corrupt rather than undo (ADR 0026).
		mutationFn: async ({ filename }: { filename: string }) => {
			const result = await api.app.backup.restore({ filename });
			inverseStack.clear();
			await api.app.state.reconcile();

			return result;
		},
		onSuccess: async () => {
			await invalidateRoot(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useCreateWorkspaceSnapshot(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.snapshotCreated(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.app.remoteSync.snapshotNow(),
		onSuccess: async (state) => {
			client.setQueryData(keys.remoteSync, state);
			await client.invalidateQueries({ queryKey: keys.backups });
			await client.invalidateQueries({ queryKey: keys.remoteSync });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/** ask the updater whether a newer release exists. resolves to `null` when none does. */
export function useCheckForUpdate(opts: MutationOptions = {}) {
	return createMutation(() => ({
		mutationFn: () => tauri.update.check(),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

/** put the workspace in a state an installer may replace the binary from. */
export function usePrepareUpdate(opts: MutationOptions = {}) {
	return createMutation(() => ({
		mutationFn: ({ targetVersion }: { targetVersion: string }) =>
			api.app.update.prepare({ targetVersion }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

/**
 * push the workspace to the remote, then restart.
 *
 * the push reads the remote state already in the cache rather than subscribing
 * to it: a caller that only restarts should not hold a live query open for the
 * whole time it is on screen.
 */
export function useRestartApp(opts: MutationOptions = {}) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: async () => {
			await syncWorkspaceBeforeExit(client.getQueryData<RemoteSyncState>(keys.remoteSync));
			await tauri.window.restart();
		},
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

/**
 * ask whether the workspace and its remote have diverged. resolves to `null`
 * when the workspace is not on a remote that can diverge.
 */
/**
 * reach the control plane and keep this machine replicating.
 *
 * *It was `useSyncGoogleDriveWorkspace` and pushed or pulled a whole workspace. Drive sync
 * retired (decision 07); a replica pushes its own writes, so what a person pressing Sync asks
 * for is the one thing left that a person can be waiting on — the window.*
 */
export function useSyncWorkspace(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.workspaceUpToDate(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => syncWorkspaceNow(),
		onSuccess: async (result) => {
			client.setQueryData(keys.remoteSync, result.state);
			await client.invalidateQueries({ queryKey: keys.remoteSync });

			// The window has closed. It is not a success and it is not a failure — nothing went
			// wrong and nothing was lost — so it is neither of the two toasts but the sentence
			// naming the one thing they can do about it.
			if (result.action === 'signInRequired') {
				toast.error(get(LL).settingsHooks.sessionExpired());
				return;
			}

			onMutationSuccess(opts);
		},
		onError: async (e) => {
			await client.invalidateQueries({ queryKey: keys.remoteSync });
			onMutationError(opts, e);
		}
	}));
}
