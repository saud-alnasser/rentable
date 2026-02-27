import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';

export const keys = {
	all: ['tenants'],
	get: (id: number) => ['tenants', id]
} as const;

export function useFetchTenants() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.tenant.getMany({})
	}));
}

export function useFetchTenant(id: number) {
	return createQuery(() => ({
		queryKey: keys.get(id),
		queryFn: () => api.tenant.get({ id })
	}));
}

export function useCreateTenant(
	opts: MutationOptions = {
		toast: {
			success: 'tenant created successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.tenant.create>[0]) => api.tenant.create(data),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateTenant(
	opts: MutationOptions = {
		toast: {
			success: 'tenant updated successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.tenant.update>[0]) => api.tenant.update(data),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteTenant(
	opts: MutationOptions = {
		toast: {
			success: 'tenant deleted successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.tenant.delete({ id }),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
