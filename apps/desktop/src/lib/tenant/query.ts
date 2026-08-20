import api from '$lib/api/caller';
import { declareMutation } from '$lib/design/mutation';
import type { HistoryEntry } from '$lib/history/history';
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
	id: string | undefined;
	enabled?: boolean;
};

export const keys = {
	all: workspacePrefixes.tenants,
	get: (id: string) => [...workspacePrefixes.tenants, 'detail', id],
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
	// the selection itself, sorted: the same set assembled in a different order is the same
	// question, and two cache entries for it would ask the workspace twice.
	plan: (ids: readonly string[]) => [
		...workspacePrefixes.tenants,
		'plan',
		[...ids].sort().join(',')
	],
	search: (term: string) => [...workspacePrefixes.tenants, 'search', term]
} as const;

/** Why a tenant in a selection would be turned away, read off the procedure rather than restated. */
export type TenantRefusalReason = Awaited<
	ReturnType<typeof api.tenant.planMany>
>['refused'][number]['reason'];

const toTenantIds = (tenants: readonly { id: string }[]) => tenants.map((tenant) => tenant.id);

/**
 * One line on one tenant's own account.
 *
 * A multi-record action writes one of these per tenant it changed, named the way a reader knows
 * one: a selection is how the reader acted, and a record's history is about the record.
 */
const toTenantHistoryEntry = (
	tenant: { id: string; name: string },
	action: HistoryEntry['action']
) => ({
	concept: 'tenant' as const,
	recordId: tenant.id,
	action,
	record: tenant.name
});

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

/**
 * What deleting the tenants named would do, before it is done.
 *
 * Asked of the workspace rather than read off the rows. A tenant row does carry a contract count
 * per status, so this is one of the two lists that could preview from what is already on screen;
 * it does not, because an application answering one question two ways is what the effort behind
 * this exists to remove.
 */
export function usePlanManyTenants(ids: () => readonly string[]) {
	return createQuery(() => {
		const named = [...ids()];

		return {
			queryKey: keys.plan(named),
			enabled: named.length > 0,
			queryFn: () => api.tenant.planMany({ ids: named })
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
			queryKey: keys.get(id ?? ''),
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

/**
 * Delete every tenant in the selection that no contract mentions, as one change.
 *
 * **Taking it back is all or nothing.** The inverse creates the whole set in one batch and throws
 * where any one of them cannot be put back, rather than restoring what it can and naming the
 * rest, which would leave the workspace in a shape neither the deletion nor the undo describes.
 * An inverse that throws stays on the stack, so the reader can deal with whatever refused it and
 * press undo again.
 *
 * The rows themselves are what the procedure answers with, because putting a record back means
 * putting it back as itself, by the identity it had (ADR 0026).
 */
export const useDeleteManyTenants = declareMutation({
	mutate: (ids: string[]) => api.tenant.deleteMany({ ids }),
	touches: ['tenants'],
	inverse: ({ result }) =>
		// nothing changed, so there is nothing to offer taking back. An undo entry for a no-op is a
		// control that appears to have done something.
		result.deleted.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.deletedMany({ count: result.deleted.length }),
					undo: () => api.tenant.createMany({ tenants: result.deleted }),
					redo: () => api.tenant.deleteMany({ ids: toTenantIds(result.deleted) }),
					records: (direction) =>
						result.deleted.map((tenant) =>
							toTenantHistoryEntry(tenant, direction === 'undo' ? 'created' : 'deleted')
						)
				},
	// the names are frozen here for the reason the whole entry is: a moment later the records are
	// gone, and an account that could only name what still exists could not report a deletion.
	records: ({ result }) => result.deleted.map((tenant) => toTenantHistoryEntry(tenant, 'deleted')),
	toast: {
		// the count, because it is the one thing about a bulk action a reader cannot see for
		// themselves, and nothing at all where the selection turned out to hold nothing this could
		// be done to. The confirmation has already said why in that case.
		success: ({ result }) =>
			result.deleted.length > 0
				? get(LL).tenants.hooks.deleteManySuccess({ count: result.deleted.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteTenant = declareMutation({
	mutate: (id: string) => api.tenant.delete({ id }),
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
