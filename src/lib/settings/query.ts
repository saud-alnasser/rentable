import api from '$lib/api/mod';
import { tauri, type GoogleDriveConflictResolution, type RemoteSyncState } from '$lib/api/tauri';
import { unlinkGoogleDriveWorkspace } from '$lib/sync/link';
import { pendingConflict } from '$lib/sync/pending-conflict.svelte';
import {
	inspectWorkspaceSyncState,
	syncWorkspaceBeforeExit,
	syncWorkspaceRemoteNow,
	type WorkspaceRemoteSyncResult
} from '$lib/sync/workspace';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: ['settings'],
	settings: ['settings', 'data'],
	backups: ['settings', 'backups'],
	remoteSync: ['settings', 'remote-sync']
} as const;

export type SyncGoogleDriveWorkspaceResult = WorkspaceRemoteSyncResult;

async function invalidateSettingsAndAppData(client: ReturnType<typeof useQueryClient>) {
	await Promise.all([
		client.invalidateQueries({ queryKey: keys.settings }),
		client.invalidateQueries({ queryKey: keys.backups }),
		client.invalidateQueries({ queryKey: keys.remoteSync }),
		client.invalidateQueries({ queryKey: ['contracts'] }),
		client.invalidateQueries({ queryKey: ['tenants'] }),
		client.invalidateQueries({ queryKey: ['complexes'] })
	]);
}

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
				client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] })
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
		mutationFn: async ({ filename }: { filename: string }) => {
			const result = await api.app.backup.restore({ filename });
			await api.app.state.reconcile();

			return result;
		},
		onSuccess: async () => {
			await invalidateSettingsAndAppData(client);

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
export function useInspectWorkspaceSyncState(opts: MutationOptions = {}) {
	return createMutation(() => ({
		mutationFn: (syncState: RemoteSyncState) => inspectWorkspaceSyncState(syncState),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

export function useResolveGoogleDriveLink(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.googleDriveLinked(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => syncWorkspaceRemoteNow(),
		onSuccess: async (result) => {
			client.setQueryData(keys.remoteSync, result.state);

			if (result.action === 'pulled') {
				await invalidateSettingsAndAppData(client);
			} else {
				await Promise.all([
					client.invalidateQueries({ queryKey: keys.remoteSync }),
					client.invalidateQueries({ queryKey: keys.backups })
				]);
			}

			onMutationSuccess(opts);
		},
		onError: async (e) => {
			await client.invalidateQueries({ queryKey: keys.remoteSync });
			onMutationError(opts, e);
		}
	}));
}

/** settle the conflict waiting on the user, the way they chose. */
export function useResolvePendingConflict(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.googleDriveLinked(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (resolution: GoogleDriveConflictResolution) => pendingConflict.resolve(resolution),
		onSuccess: async (result) => {
			if (!result) {
				return;
			}

			client.setQueryData(keys.remoteSync, result.state);

			if (result.action === 'pulled') {
				await invalidateSettingsAndAppData(client);
			} else {
				await Promise.all([
					client.invalidateQueries({ queryKey: keys.remoteSync }),
					client.invalidateQueries({ queryKey: keys.backups })
				]);
			}

			onMutationSuccess(opts);
		},
		onError: async (e) => {
			await client.invalidateQueries({ queryKey: keys.remoteSync });
			onMutationError(opts, e);
		}
	}));
}

/**
 * set the conflict aside, undoing the link where there is one to undo. The state being set
 * aside is remembered, so the same question is not asked again until it changes.
 */
export function useDismissPendingConflict(opts: MutationOptions = {}) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => pendingConflict.dismiss(),
		onSuccess: async (dismissal) => {
			if (dismissal && !dismissal.deferred && dismissal.state) {
				client.setQueryData(keys.remoteSync, dismissal.state);
				await invalidateSettingsAndAppData(client);
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/** clear a workspace whose remote link no longer works, so it can be linked again. */
export function useRelinkPendingConflict(
	opts: MutationOptions = {
		toast: {
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => pendingConflict.relink(),
		onSuccess: (state) => {
			if (state) {
				client.setQueryData(keys.remoteSync, state);
			}

			onMutationSuccess(opts);
		},
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

export function useUnlinkGoogleDriveWorkspace(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.googleDriveUnlinked(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => unlinkGoogleDriveWorkspace(),
		onSuccess: async (state) => {
			client.setQueryData(keys.remoteSync, state);
			await invalidateSettingsAndAppData(client);
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useSyncGoogleDriveWorkspace(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.googleDriveSynchronized(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();
	const mutationFn = async ({
		manual
	}: { manual?: boolean } = {}): Promise<SyncGoogleDriveWorkspaceResult> =>
		syncWorkspaceRemoteNow(undefined, { manual });

	return createMutation(() => ({
		mutationFn,
		onSuccess: async (result) => {
			client.setQueryData(keys.remoteSync, result.state);

			if (result.action === 'pulled') {
				await invalidateSettingsAndAppData(client);
			} else {
				await Promise.all([
					client.invalidateQueries({ queryKey: keys.remoteSync }),
					client.invalidateQueries({ queryKey: keys.backups })
				]);
			}

			if (!('preparation' in result) || !result.preparation) {
				if (result.action === 'none') {
					onMutationSuccess({
						toast: {
							success: () => get(LL).settingsHooks.googleDriveAlreadyUpToDate()
						}
					});
				} else {
					onMutationSuccess(opts);
				}
			}
		},
		onError: async (e) => {
			await client.invalidateQueries({ queryKey: keys.remoteSync });
			onMutationError(opts, e);
		}
	}));
}
