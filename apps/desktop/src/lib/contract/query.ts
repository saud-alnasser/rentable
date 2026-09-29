import api from '$lib/api/caller';
import {
	CONTRACT_SORT_COLUMN_IDS,
	toContractName as toContractRecordName,
	type ContractSortColumnId
} from '$lib/contract/contract';
import { declareMutation, prefixOf } from '$lib/mutation';
import type { ContractRank } from '$lib/contract/rank/rank';
import type { ListSort } from '@rentable/design/sort.js';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * Which contracts a list is asking for, beyond its search and its order.
 *
 * The directory asks for all of them; a tenant's profile, a unit's view and a complex's record
 * each ask for the ones that concern the record being looked at, and a surface that ranked a
 * contract asks for one rank.
 *
 * Every one of them narrows in the procedure, so the surface never receives a wider set to
 * filter. The first three narrow in SQL; a rank cannot, because it is decided from what the
 * contract owes today and no column holds that.
 */
export type ContractListScope = {
	tenantId?: string;
	unitId?: string;
	complexId?: string;
	rank?: ContractRank;
};

export const keys = {
	list: (search: string, sort: ListSort | null, scope: ContractListScope = {}) => [
		...prefixOf('contract'),
		'list',
		search,
		sort ? `${sort.columnId}:${sort.direction}` : 'default',
		// part of the key rather than a filter over a shared set: a tenant's contracts and a
		// unit's are different queries, and sharing a cache entry would serve one surface the
		// other's rows.
		scope.tenantId ?? 'all',
		scope.unitId ?? 'all',
		scope.complexId ?? 'all',
		scope.rank ?? 'all'
	],
	// the selection itself, sorted: the same set assembled in a different order is the same
	// question, and two cache entries for it would ask the workspace twice.
	plan: (action: ContractSelectionAction | null, ids: readonly string[]) => [
		...prefixOf('contract'),
		'plan',
		action ?? 'none',
		[...ids].sort().join(',')
	],
	get: (id: string) => [...prefixOf('contract'), id],
	getUnits: (id: string) => [...prefixOf('contract'), 'units', id],
	getSchedule: (id: string) => [...prefixOf('contract'), 'schedule', id],
	getReminder: (id: string) => [...prefixOf('contract'), 'reminder', id],
	search: (term: string) => [...prefixOf('contract'), 'search', term],
	getAssignableUnits: (contractId: string, search: string) => [
		...prefixOf('contract'),
		'units',
		'assignable',
		contractId,
		search
	],
	getAssignableUnitsForTerm: (start: number, end: number, search: string) => [
		...prefixOf('contract'),
		'units',
		'assignable-for-term',
		start,
		end,
		search
	]
} as const;

// the shell's sort carries a bare string, because it is shared by lists that order by
// different keys. This is where it becomes one of this list's own.
function isContractSortColumnId(columnId: string): columnId is ContractSortColumnId {
	return (CONTRACT_SORT_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * What a contract is called in an account of what happened to it.
 *
 * The government id first, because it is the reference a reader knows a contract by, and the
 * tenant's name where there is none — the same fallback the delete confirmation already uses,
 * so one record is named the same way wherever it is spoken about.
 */
/** the concept's own naming, with the translation this side happens to hold. */
export const toContractName = (contract: { govId?: string | null; tenantName?: string | null }) =>
	toContractRecordName(contract, get(LL).common.labels.contract());

/** Which action a selection is being planned for, read off the procedure rather than restated. */
export type ContractSelectionAction = Parameters<typeof api.contract.planMany>[0]['action'];

/** Why a contract in a selection would be turned away, read off the same procedure. */
export type ContractRefusalReason = Awaited<
	ReturnType<typeof api.contract.planMany>
>['refused'][number]['reason'];

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
	scope: () => ContractListScope = () => ({}),
	enabled: () => boolean = () => true
) {
	return createQuery(() => {
		const trimmedSearch = search().trim();
		const chosenSort = sort();
		const chosenScope = scope();

		return {
			queryKey: keys.list(trimmedSearch, chosenSort, chosenScope),
			enabled: enabled(),
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

/** The contracts a palette search reaches. Bounded in SQL; nothing is narrowed again here. */
export function useSearchContracts(term: () => string, limit: number) {
	return createQuery(() => {
		const trimmed = term().trim();

		return {
			queryKey: keys.search(trimmed),
			enabled: trimmed.length > 0,
			queryFn: () => api.contract.search({ term: trimmed, limit }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

/**
 * What one of the three selection actions would do to the contracts named, before it is done.
 *
 * Asked of the workspace rather than read off the rows, so the confirmation shows what the
 * mutation is about to decide rather than a second opinion about it.
 */
export function usePlanManyContracts(
	ids: () => readonly string[],
	action: () => ContractSelectionAction | null
) {
	return createQuery(() => {
		const chosen = action();
		const named = [...ids()];

		return {
			queryKey: keys.plan(chosen, named),
			enabled: chosen !== null && named.length > 0,
			queryFn: async () => {
				if (chosen === null) {
					// unreachable while the query is disabled, and answered rather than thrown so the
					// caller reads one shape instead of an assertion about which one it got.
					return { eligible: [] as string[], refused: [] };
				}

				return api.contract.planMany({ ids: named, action: chosen });
			}
		};
	});
}

export function useFetchContract(id: () => string, enabled: () => boolean = () => true) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			enabled: enabled(),
			queryFn: () => api.contract.get({ id: freshId })
		};
	});
}

/** One cycle of a contract's schedule, as the procedure answers with it. */
export type ContractScheduleCycle = Awaited<ReturnType<typeof api.contract.schedule>>[number];

/**
 * A contract's schedule, cycle by cycle, as the procedure allocates it. The pane renders what
 * arrives and allocates nothing itself; a payment written anywhere invalidates the contracts
 * prefix this key sits under, so the cover it shows follows the ledger.
 */
export function useFetchContractSchedule(
	contractId: () => string,
	enabled: () => boolean = () => true
) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getSchedule(id),
			enabled: enabled(),
			queryFn: () => api.contract.schedule({ id })
		};
	});
}

/**
 * Read one contract once, for a caller that holds only its identity and has to act on the rest:
 * the contract host, answering an act the command menu or the dashboard named by id. Through the
 * cache, under the same key the record's page reads, so a contract already on screen is not read
 * twice.
 */
export function useReadContract() {
	const client = useQueryClient();

	return (id: string) =>
		client.fetchQuery({ queryKey: keys.get(id), queryFn: () => api.contract.get({ id }) });
}

/**
 * Creating a contract, with the units it is created holding.
 *
 * It touches units as well as contracts because the assignment rows go down in the same write, so
 * the occupancy the units query answers with has moved by the time this resolves.
 */
export const useCreateContract = declareMutation({
	mutate: (data: Parameters<typeof api.contract.create>[0]) => api.contract.create(data),
	touches: ['contracts', 'units'],
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.contract() }),
		flags: { undo: ['deleteContract'], redo: ['createContract'] },
		// one call: the deletion releases the units in the same batch, so the undo lands whole or
		// not at all, and a contract holding units is never left standing without them.
		undo: () => api.contract.delete({ id: result.id }),
		// created again as itself, holding the units it was created with.
		redo: () => api.contract.create({ ...result, unitIds: variables.unitIds }),
		records: (direction) => ({
			concept: 'contract',
			recordId: result.id,
			action: direction === 'undo' ? 'deleted' : 'created',
			record: toContractName(result)
		})
	}),
	records: ({ result }) => ({
		concept: 'contract',
		recordId: result.id,
		action: 'created',
		record: toContractName(result)
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
			flags: { undo: ['editContract'], redo: ['editContract'] },
			undo: () => api.contract.update(captured),
			redo: () => api.contract.update(variables),
			// both directions are an edit: what changed differs, that it was edited does not.
			records: () => ({
				concept: 'contract',
				recordId: variables.id,
				action: 'edited',
				record: toContractName(variables)
			})
		},
	records: ({ variables }) => ({
		concept: 'contract',
		recordId: variables.id,
		action: 'edited',
		record: toContractName(variables)
	}),
	toast: {
		success: () => get(LL).contracts.hooks.updateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteContract = declareMutation({
	mutate: (id: string) => api.contract.delete({ id }),
	// units as well: the units it held are released in the same write.
	touches: ['contracts', 'units'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.contract() }),
			flags: { undo: ['editContract'], redo: ['deleteContract'] },
			// restored as it was, status included, holding the units it held, which the deletion
			// answered with. A restore rather than a create ([[rules/data]], under *Undo*): a create
			// would derive the status again and ask whether the units are free today.
			undo: () => api.contract.restoreMany({ contracts: [result] }),
			redo: () => api.contract.delete({ id: result.id }),
			records: (direction) => ({
				concept: 'contract',
				recordId: result.id,
				// a deleted contract comes back through a restore, which is an edit, so it is recorded
				// as one: an entry naming a creation asks the create flag the restore never needed.
				action: direction === 'undo' ? 'unterminated' : 'deleted',
				record: toContractName(result)
			})
		},
	// the name is frozen here for the reason the whole entry is: a moment later the record is
	// gone, and an account that could only name what still exists could not report a deletion.
	records: ({ result }) =>
		result && {
			concept: 'contract',
			recordId: result.id,
			action: 'deleted',
			record: toContractName(result)
		},
	toast: {
		success: () => get(LL).contracts.hooks.deleteSuccess(),
		// no dialog asked first, so the announcement says how long it can be taken back.
		detail: () => get(LL).common.undo.lasts(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useTerminateContract = declareMutation({
	mutate: (id: string) => api.contract.terminate({ id }),
	touches: ['contracts', 'units'],
	// un-terminating is the procedure that already exists to reverse this, and it recomputes the
	// derived status rather than putting back the one the contract happened to hold.
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.terminated({ record: t.common.labels.contract() }),
		flags: { undo: ['editContract'], redo: ['editContract'] },
		undo: () => api.contract.unterminate({ id: variables }),
		redo: () => api.contract.terminate({ id: variables }),
		records: (direction) => ({
			concept: 'contract',
			recordId: variables,
			action: direction === 'undo' ? 'unterminated' : 'terminated',
			record: toContractName(result)
		})
	}),
	records: ({ result }) => ({
		concept: 'contract',
		recordId: result.id,
		action: 'terminated',
		record: toContractName(result)
	}),
	toast: {
		success: () => get(LL).contracts.hooks.terminateSuccess(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUnterminateContract = declareMutation({
	mutate: (id: string) => api.contract.unterminate({ id }),
	touches: ['contracts', 'units'],
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.unterminated({ record: t.common.labels.contract() }),
		flags: { undo: ['editContract'], redo: ['editContract'] },
		undo: () => api.contract.terminate({ id: variables }),
		redo: () => api.contract.unterminate({ id: variables }),
		records: (direction) => ({
			concept: 'contract',
			recordId: variables,
			action: direction === 'undo' ? 'terminated' : 'unterminated',
			record: toContractName(result)
		})
	}),
	records: ({ result }) => ({
		concept: 'contract',
		recordId: result.id,
		action: 'unterminated',
		record: toContractName(result)
	}),
	toast: {
		success: () => get(LL).contracts.hooks.restoreSuccess(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export function useFetchContractUnits(
	contractId: () => string,
	enabled: () => boolean = () => true
) {
	return createQuery(() => {
		const id = contractId();

		return {
			queryKey: keys.getUnits(id),
			enabled: enabled(),
			queryFn: () => api.contract.units.getMany({ contractId: id })
		};
	});
}

/**
 * Every unit this contract may hold, assigned or not — both panes of the transfer surface.
 *
 * `isAssigned` is what separates the panes, so the two sides are one read and cannot disagree
 * about a unit. `placeholderData` holds the previous set while a new search is in flight, so
 * the panes keep their rows instead of emptying on every keystroke.
 */
export function useFetchAssignableContractUnits(
	params: () => { contractId: string; search?: string }
) {
	return createQuery(() => {
		const { contractId, search } = params();
		const trimmedSearch = search?.trim() ?? '';

		return {
			queryKey: keys.getAssignableUnits(contractId, trimmedSearch),
			queryFn: () =>
				api.contract.units.getAssignableMany({
					contractId,
					search: trimmedSearch || undefined
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

/**
 * Every unit free over a term, for a contract that does not exist yet: what the contract form
 * offers. Disabled until the term has both ends, because the conflict rule has nothing to read
 * before then.
 */
export function useFetchAssignableUnitsForTerm(
	params: () => { start?: number; end?: number; search?: string; enabled: boolean }
) {
	return createQuery(() => {
		const { start, end, search, enabled } = params();
		const trimmedSearch = search?.trim() ?? '';
		const hasTerm = start !== undefined && end !== undefined;

		return {
			queryKey: keys.getAssignableUnitsForTerm(start ?? 0, end ?? 0, trimmedSearch),
			enabled: enabled && hasTerm,
			queryFn: () =>
				api.contract.units.getAssignableForTerm({
					start: start ?? 0,
					end: end ?? 0,
					search: trimmedSearch || undefined
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

export const useSetContractUnits = declareMutation({
	mutate: (data: Parameters<typeof api.contract.units.set>[0]) => api.contract.units.set(data),
	touches: ['contracts', 'units'],
	// the set the contract held before the change, which is what makes the inverse another set
	// rather than a sequence of removals and additions to replay in order.
	capture: (variables) => api.contract.units.getMany({ contractId: variables.contractId }),
	inverse: ({ variables, captured }) => ({
		describe: (t) => t.common.undo.assigned({ record: t.common.labels.contract() }),
		flags: { undo: ['editContract'], redo: ['editContract'] },
		undo: () =>
			api.contract.units.set({
				contractId: variables.contractId,
				unitIds: captured.map((unit) => unit.id)
			}),
		redo: () => api.contract.units.set(variables)
	}),
	// no success message: the row landing in the other pane is the confirmation, and a surface
	// announcing what the reader just watched happen is noise (ADR 0029). A refusal still speaks,
	// because nothing on screen moves to say it.
	toast: {
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
