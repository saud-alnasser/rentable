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
	all: ['settings']
} as const;

async function invalidateSettingsAndAppData(client: ReturnType<typeof useQueryClient>) {
	await Promise.all([
		client.invalidateQueries({ queryKey: keys.all }),
		client.invalidateQueries({ queryKey: ['contracts'] }),
		client.invalidateQueries({ queryKey: ['tenants'] }),
		client.invalidateQueries({ queryKey: ['complexes'] })
	]);
}

export function useFetchSettings() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.settings.get()
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
		mutationFn: (data: Parameters<typeof api.settings.setEndingSoonNoticeDays>[0]) =>
			api.settings.setEndingSoonNoticeDays(data),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: keys.all }),
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
		mutationFn: async (data: Parameters<typeof api.settings.setDatabasePath>[0]) => {
			const result = await api.settings.setDatabasePath(data);
			await api.state.sync();

			return result;
		},
		onSuccess: async () => {
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
			const result = await api.settings.resetDatabasePath();
			await api.state.sync();

			return result;
		},
		onSuccess: async () => {
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
		mutationFn: () => api.settings.createBackup(),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useProceedFailedUpdate(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.startupRecoveryCleared(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.settings.proceedFailedUpdate(),
		onSuccess: async () => {
			await invalidateSettingsAndAppData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useRollbackFailedUpdate(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.rollbackRestored(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.settings.rollbackFailedUpdate(),
		onSuccess: async () => {
			await invalidateSettingsAndAppData(client);

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
		mutationFn: (data: Parameters<typeof api.settings.deleteBackup>[0]) =>
			api.settings.deleteBackup(data),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.all });

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
		mutationFn: async (data: Parameters<typeof api.settings.restoreBackup>[0]) => {
			const result = await api.settings.restoreBackup(data);
			await api.state.sync();

			return result;
		},
		onSuccess: async () => {
			await invalidateSettingsAndAppData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
