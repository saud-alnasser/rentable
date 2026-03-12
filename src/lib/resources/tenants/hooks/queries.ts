import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

type FetchTenantsParams = {
	search?: string;
	limit?: number;
	enabled?: boolean;
};

type FetchTenantParams = {
	id: number | undefined;
	enabled?: boolean;
};

export const keys = {
	all: ['tenants'],
	get: (id: number) => ['tenants', 'detail', id],
	getMany: (search?: string, limit?: number) => ['tenants', 'list', search ?? '', limit ?? 'all']
} as const;

export function useFetchTenants(params: () => FetchTenantsParams = () => ({})) {
	return createQuery(() => {
		const { search, limit, enabled = true } = params();
		const trimmedSearch = search?.trim();

		return {
			queryKey: trimmedSearch || limit ? keys.getMany(trimmedSearch, limit) : keys.all,
			enabled,
			placeholderData: (previousData: Awaited<ReturnType<typeof api.tenant.getMany>> | undefined) =>
				previousData,
			queryFn: () =>
				api.tenant.getMany({
					search: trimmedSearch || undefined,
					limit
				})
		};
	});
}

export function useFetchTenant(params: () => FetchTenantParams) {
	return createQuery(() => {
		const { id, enabled = true } = params();

		return {
			queryKey: keys.get(id ?? 0),
			enabled: enabled && Boolean(id),
			queryFn: async () => {
				if (!id) return undefined;

				return api.tenant.get({ id });
			}
		};
	});
}

export function useCreateTenant(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).tenants.hooks.createSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.tenant.create>[0]) => api.tenant.create(data),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateTenant(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).tenants.hooks.updateSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.tenant.update>[0]) => api.tenant.update(data),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteTenant(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).tenants.hooks.deleteSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.tenant.delete({ id }),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
