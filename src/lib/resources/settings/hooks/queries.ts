import api from '$lib/api/mod';
import {
	cancelGoogleDriveLink,
	prepareGoogleDriveLink,
	resolveGoogleDriveLink,
	syncActiveGoogleDriveProfile,
	unlinkActiveGoogleDriveWorkspace,
	type GoogleDriveLinkPreparation,
	type GoogleDriveLinkResolution,
	type GoogleDriveSyncMode,
	type GoogleDriveSyncResult
} from '$lib/api/utils/remote-sync-google-drive';
import {
	syncWorkspaceRemoteNow,
	type WorkspaceRemoteSyncResult
} from '$lib/api/utils/workspace-sync';
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

export type SyncGoogleDriveWorkspaceResult = GoogleDriveSyncResult | WorkspaceRemoteSyncResult;

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
			await api.app.state.sync();

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

export function usePrepareGoogleDriveLink(opts: MutationOptions = {}) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: async () => {
			return await prepareGoogleDriveLink();
		},
		onSuccess: async (result) => {
			client.setQueryData(keys.remoteSync, result.state);
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
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
		mutationFn: ({
			preparation,
			resolution
		}: {
			preparation: GoogleDriveLinkPreparation;
			resolution?: GoogleDriveLinkResolution | Extract<GoogleDriveSyncMode, 'push' | 'pull'>;
		}) => resolveGoogleDriveLink(preparation, resolution),
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

export function useCancelGoogleDriveLink(opts: MutationOptions = {}) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ preparation }: { preparation: GoogleDriveLinkPreparation }) =>
			cancelGoogleDriveLink(preparation),
		onSuccess: async (state) => {
			client.setQueryData(keys.remoteSync, state);
			await invalidateSettingsAndAppData(client);
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
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
		mutationFn: () => unlinkActiveGoogleDriveWorkspace(),
		onSuccess: async (state) => {
			client.setQueryData(keys.remoteSync, state);
			await invalidateSettingsAndAppData(client);
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useSyncGoogleDriveWorkspace(
	mode: GoogleDriveSyncMode,
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
		mode === 'sync'
			? syncWorkspaceRemoteNow(undefined, { manual })
			: syncActiveGoogleDriveProfile(mode, undefined, { manual });

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
