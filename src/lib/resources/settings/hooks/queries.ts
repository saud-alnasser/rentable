import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';

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
			success: 'ending soon notice window updated successfully!',
			error: true,
			unexpected: 'unexpected error occurred!'
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
			success: 'database path updated successfully!',
			error: true,
			unexpected: 'unexpected error occurred!'
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
			success: 'database path reset to default successfully!',
			error: true,
			unexpected: 'unexpected error occurred!'
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
			success: 'backup created successfully!',
			error: true,
			unexpected: 'unexpected error occurred!'
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

export function useDeleteBackup(
	opts: MutationOptions = {
		toast: {
			success: 'backup deleted successfully!',
			error: true,
			unexpected: 'unexpected error occurred!'
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
			success: 'backup restored successfully!',
			error: true,
			unexpected: 'unexpected error occurred!'
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
