import api from '$lib/api/mod';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';

export const keys = {
	all: ['tenants'],
	details: (id: number) => ['tenants', id]
} as const;

export function useFetchTenants() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.tenant.getMany({})
	}));
}

export function useFetchTenant(id: number) {
	return createQuery(() => ({
		queryKey: keys.details(id),
		queryFn: () => api.tenant.get({ id })
	}));
}

export function useCreateTenant() {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.tenant.create>[0]) => api.tenant.create(data),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
		onError: () => toast.error('unexpected error occurred!')
	}));
}

export function useUpdateTenant() {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.tenant.update>[0]) => api.tenant.update(data),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
		onError: () => toast.error('unexpected error occurred!')
	}));
}

export function useDeleteTenant() {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.tenant.delete({ id }),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
		onError: () => toast.error('unexpected error occurred!')
	}));
}

export function useDeleteTenants() {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (ids: number[]) => api.tenant.deleteMany({ ids }),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
		onError: () => toast.error('unexpected error occurred!')
	}));
}
