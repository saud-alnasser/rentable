import api from '$lib/api/mod';
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
	backups: ['settings', 'backups']
} as const;

async function invalidateSettingsAndAppData(client: ReturnType<typeof useQueryClient>) {
	await Promise.all([
		client.invalidateQueries({ queryKey: keys.settings }),
		client.invalidateQueries({ queryKey: keys.backups }),
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

export function useSetDatabasePath(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.databasePathUpdated(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: async ({ path }: { path: string }) => {
			const result = await api.app.settings.set({ databasePath: path });
			await api.app.state.sync();

			return result;
		},
		onSuccess: async (settings) => {
			client.setQueryData(keys.settings, settings);

			await invalidateSettingsAndAppData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useResetDatabasePath(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.databasePathReset(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: async () => {
			const result = await api.app.settings.set({ databasePath: '' });
			await api.app.state.sync();

			return result;
		},
		onSuccess: async (settings) => {
			client.setQueryData(keys.settings, settings);

			await invalidateSettingsAndAppData(client);

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
