import api from '$lib/api/caller';
import { declareMutation } from '$lib/design/mutation';
import { workspacePrefixes } from '$lib/design/query';
import type { ListSort } from '$lib/design/sort';
import { TENANT_SORT_COLUMN_IDS, type TenantSortColumnId } from '$lib/tenant/tenant';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
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
	all: workspacePrefixes.tenants,
	get: (id: number) => [...workspacePrefixes.tenants, 'detail', id],
	getMany: (search?: string, limit?: number) => [
		...workspacePrefixes.tenants,
		'list',
		search ?? '',
		limit ?? 'all'
	],
	list: (search: string, sort: ListSort | null) => [
		...workspacePrefixes.tenants,
		'list',
		search,
		sort ? `${sort.columnId}:${sort.direction}` : 'default'
	],
	search: (term: string) => [...workspacePrefixes.tenants, 'search', term]
} as const;

/** The tenants a palette search reaches. Bounded in SQL; nothing is narrowed again here. */
export function useSearchTenants(term: () => string, limit: number) {
	return createQuery(() => {
		const trimmed = term().trim();

		return {
			queryKey: keys.search(trimmed),
			enabled: trimmed.length > 0,
			queryFn: () => api.tenant.search({ term: trimmed, limit }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

// the shell's sort carries a bare string, because it is shared by lists that order by
// different keys. This is where it becomes one of this list's own.
function isTenantSortColumnId(columnId: string): columnId is TenantSortColumnId {
	return (TENANT_SORT_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * The tenants directory for a search and an order: the whole result set, each row carrying
 * how many contracts that tenant currently holds.
 *
 * `placeholderData` holds the previous set while a new query is in flight, so the list keeps
 * rendering rows instead of flashing through its loading state on every keystroke.
 */
export function useListTenants(
	search: () => string = () => '',
	sort: () => ListSort | null = () => null
) {
	return createQuery(() => {
		const trimmedSearch = search().trim();
		const chosenSort = sort();

		return {
			queryKey: keys.list(trimmedSearch, chosenSort),
			queryFn: () =>
				api.tenant.getMany({
					search: trimmedSearch || undefined,
					sort:
						chosenSort && isTenantSortColumnId(chosenSort.columnId)
							? { columnId: chosenSort.columnId, direction: chosenSort.direction }
							: undefined
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

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

export const useCreateTenant = declareMutation({
	mutate: (data: Parameters<typeof api.tenant.create>[0]) => api.tenant.create(data),
	touches: ['tenants'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.tenant() }),
		undo: () => api.tenant.delete({ id: result.id }),
		redo: () => api.tenant.create(result)
	}),
	toast: {
		success: () => get(LL).tenants.hooks.createSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Create every tenant a file named, in one write.
 *
 * The inverse deletes what it created, one call at a time — the same shape a complex's creation
 * uses to take its units back out. Redoing sends the records again rather than the rows, because
 * what was agreed to was the set the preview showed.
 */
export const useImportTenants = declareMutation({
	mutate: (records: Parameters<typeof api.tenant.importMany>[0]['records']) =>
		api.tenant.importMany({ records }),
	touches: ['tenants'],
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.imported({ count: result.length }),
		undo: async () => {
			for (const tenant of result) {
				await api.tenant.delete({ id: tenant.id });
			}
		},
		redo: () => api.tenant.importMany({ records: variables })
	}),
	toast: {
		success: () => get(LL).tenants.hooks.importSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdateTenant = declareMutation({
	mutate: (data: Parameters<typeof api.tenant.update>[0]) => api.tenant.update(data),
	touches: ['tenants'],
	capture: (variables) => api.tenant.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: t.common.labels.tenant() }),
			undo: () => api.tenant.update(captured),
			redo: () => api.tenant.update(variables)
		},
	toast: {
		success: () => get(LL).tenants.hooks.updateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteTenant = declareMutation({
	mutate: (id: number) => api.tenant.delete({ id }),
	touches: ['tenants'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.tenant() }),
			undo: () => api.tenant.create(result),
			redo: () => api.tenant.delete({ id: result.id })
		},
	toast: {
		success: () => get(LL).tenants.hooks.deleteSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
