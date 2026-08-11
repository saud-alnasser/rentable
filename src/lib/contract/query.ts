import api from '$lib/api/caller';
import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
import { declareMutation } from '$lib/design/mutation';
import { workspacePrefixes } from '$lib/design/query';
import type { ListSort } from '$lib/design/sort';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * Which contracts a list is asking for, beyond its search and its order.
 *
 * The directory asks for all of them; a tenant's profile and a unit's view each ask for the
 * ones that concern the record being looked at. Both narrow in SQL — the surface never
 * receives a wider set to filter.
 */
export type ContractListScope = { tenantId?: number; unitId?: number };

export const keys = {
	list: (search: string, sort: ListSort | null, scope: ContractListScope = {}) => [
		...workspacePrefixes.contracts,
		'list',
		search,
		sort ? `${sort.columnId}:${sort.direction}` : 'default',
		// part of the key rather than a filter over a shared set: a tenant's contracts and a
		// unit's are different queries, and sharing a cache entry would serve one surface the
		// other's rows.
		scope.tenantId ?? 'all',
		scope.unitId ?? 'all'
	],
	get: (id: number) => [...workspacePrefixes.contracts, id],
	getUnits: (id: number) => [...workspacePrefixes.contracts, 'units', id],
	getVacantUnits: (contractId: number, complexId: number) => [
		...workspacePrefixes.contracts,
		'units',
		'vacant',
		contractId,
		complexId
	]
} as const;

// the shell's sort carries a bare string, because it is shared by lists that order by
// different keys. This is where it becomes one of this list's own.
function isContractSortColumnId(columnId: string): columnId is ContractSortColumnId {
	return (CONTRACT_SORT_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * The contracts directory for a search and an order: the whole result set, each row carrying
 * the tenant the contract is held by.
 *
 * `placeholderData` holds the previous set while a new query is in flight, so the list keeps
 * rendering rows instead of flashing through its loading state on every keystroke.
 */
export function useListContracts(
	search: () => string = () => '',
	sort: () => ListSort | null = () => null,
	scope: () => ContractListScope = () => ({})
) {
	return createQuery(() => {
		const trimmedSearch = search().trim();
		const chosenSort = sort();
		const chosenScope = scope();

		return {
			queryKey: keys.list(trimmedSearch, chosenSort, chosenScope),
			queryFn: () =>
				api.contract.getMany({
					search: trimmedSearch || undefined,
					sort:
						chosenSort && isContractSortColumnId(chosenSort.columnId)
							? { columnId: chosenSort.columnId, direction: chosenSort.direction }
							: undefined,
					...chosenScope
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

export function useFetchContract(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.contract.get({ id: freshId })
		};
	});
}

export const useCreateContract = declareMutation({
	mutate: (data: Parameters<typeof api.contract.create>[0]) => api.contract.create(data),
	touches: ['contracts'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.contract() }),
		undo: () => api.contract.delete({ id: result.id }),
		redo: () => api.contract.create(result)
	}),
	toast: {
		success: () => get(LL).contracts.hooks.createSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdateContract = declareMutation({
	mutate: (data: Parameters<typeof api.contract.update>[0]) => api.contract.update(data),
	touches: ['contracts', 'units'],
	capture: (variables) => api.contract.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: t.common.labels.contract() }),
			undo: () => api.contract.update(captured),
			redo: () => api.contract.update(variables)
		},
	toast: {
		success: () => get(LL).contracts.hooks.updateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteContract = declareMutation({
	mutate: (id: number) => api.contract.delete({ id }),
	touches: ['contracts'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.contract() }),
			undo: () => api.contract.create(result),
			redo: () => api.contract.delete({ id: result.id })
		},
	toast: {
		success: () => get(LL).contracts.hooks.deleteSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useTerminateContract = declareMutation({
	mutate: (id: number) => api.contract.terminate({ id }),
	touches: ['contracts', 'units'],
	toast: {
		success: () => get(LL).contracts.hooks.terminateSuccess(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUnterminateContract = declareMutation({
	mutate: (id: number) => api.contract.unterminate({ id }),
	touches: ['contracts', 'units'],
	toast: {
		success: () => get(LL).contracts.hooks.restoreSuccess(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export function useFetchContractUnits(contractId: () => number) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getUnits(id),
			queryFn: () => api.contract.units.getMany({ contractId: id })
		};
	});
}

export function useFetchVacantContractUnits(
	params: () => { contractId: number; complexId: number | undefined }
) {
	return createQuery(() => {
		const { contractId, complexId } = params();

		return {
			queryKey: keys.getVacantUnits(contractId, complexId ?? 0),
			enabled: Boolean(complexId),
			queryFn: async () => {
				if (!complexId) return [];

				return api.contract.units.getVacantMany({ contractId, complexId });
			}
		};
	});
}

export const useAssignContractUnits = declareMutation({
	mutate: (data: Parameters<typeof api.contract.units.assign>[0]) =>
		api.contract.units.assign(data),
	touches: ['contracts', 'units'],
	toast: {
		success: () => get(LL).contracts.hooks.assignUnitsSuccess(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useRemoveContractUnit = declareMutation({
	mutate: (data: Parameters<typeof api.contract.units.remove>[0]) =>
		api.contract.units.remove(data),
	touches: ['contracts', 'units'],
	toast: {
		success: () => get(LL).contracts.hooks.removeUnitSuccess(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
