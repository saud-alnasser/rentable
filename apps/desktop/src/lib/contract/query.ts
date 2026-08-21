import api from '$lib/api/caller';
import {
	CONTRACT_SORT_COLUMN_IDS,
	toContractName as toContractRecordName,
	type ContractSortColumnId
} from '$lib/contract/contract';
import { declareMutation, describeOutcomeChange } from '$lib/design/mutation';
import type { SelectionCall } from '$lib/design/selection';
import type { HistoryEntry } from '$lib/history/history';
import { workspacePrefixes } from '$lib/design/query';
import type { ContractRank } from '$lib/contract/rank';
import type { ListSort } from '$lib/design/sort';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
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
		...workspacePrefixes.contracts,
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
		...workspacePrefixes.contracts,
		'plan',
		action ?? 'none',
		[...ids].sort().join(',')
	],
	get: (id: string) => [...workspacePrefixes.contracts, id],
	getUnits: (id: string) => [...workspacePrefixes.contracts, 'units', id],
	search: (term: string) => [...workspacePrefixes.contracts, 'search', term],
	getAssignableUnits: (contractId: string, search: string) => [
		...workspacePrefixes.contracts,
		'units',
		'assignable',
		contractId,
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
const toContractName = (contract: { govId?: string | null; tenantName?: string | null }) =>
	toContractRecordName(contract, get(LL).common.labels.contract());

/** Which action a selection is being planned for, read off the procedure rather than restated. */
export type ContractSelectionAction = Parameters<typeof api.contract.planMany>[0]['action'];

/** Why a contract in a selection would be turned away, read off the same procedure. */
export type ContractRefusalReason = Awaited<
	ReturnType<typeof api.contract.planMany>
>['refused'][number]['reason'];

const toContractIds = (contracts: readonly { id: string }[]) =>
	contracts.map((contract) => contract.id);

/**
 * One line on one contract's own account.
 *
 * Every multi-record action writes one of these per contract it changed, named the way the
 * single-record actions name one: a selection is how the reader acted, and a record's history is
 * about the record.
 */
const toContractHistoryEntry = (
	contract: { id: string; govId?: string | null; tenantName?: string | null },
	action: HistoryEntry['action']
) => ({
	concept: 'contract' as const,
	recordId: contract.id,
	action,
	record: toContractName(contract)
});

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
 * Asked of the workspace rather than read off the rows: a contract row carries its status and a
 * payment count, and a deletion is refused for holding units, which no row knows.
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

export const useCreateContract = declareMutation({
	mutate: (data: Parameters<typeof api.contract.create>[0]) => api.contract.create(data),
	touches: ['contracts'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.contract() }),
		undo: () => api.contract.delete({ id: result.id }),
		redo: () => api.contract.create(result),
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

/**
 * Renewing a contract: one creation, taken back like any other.
 *
 * It touches units as well as contracts because the successor arrives holding the predecessor's
 * — the assignment rows go down in the same write, so the occupancy the units query answers with
 * has moved by the time this resolves.
 */
export const useRenewContract = declareMutation({
	mutate: (data: Parameters<typeof api.contract.renew>[0]) => api.contract.renew(data),
	touches: ['contracts', 'units'],
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.renewed({ record: t.common.labels.contract() }),
		// the units go first: a contract still holding units refuses to be deleted, which is the
		// rule that lets an ordinary creation's inverse be a single call.
		undo: async () => {
			await api.contract.units.set({ contractId: result.id, unitIds: [] });
			await api.contract.delete({ id: result.id });
		},
		// renewed again with the identity it had, so a page still open on the successor is holding
		// a reference to the record rather than to a copy of it.
		redo: () => api.contract.renew({ ...variables, id: result.id })
	}),
	toast: {
		success: () => get(LL).contracts.hooks.renewSuccess(),
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
	touches: ['contracts'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.contract() }),
			undo: () => api.contract.create(result),
			redo: () => api.contract.delete({ id: result.id }),
			records: (direction) => ({
				concept: 'contract',
				recordId: result.id,
				action: direction === 'undo' ? 'created' : 'deleted',
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

/**
 * Terminate every selected contract, as one change.
 *
 * **One undo entry, not one per record.** The inverse is built from what the procedure reports
 * it actually changed, so taking the action back reverses all of it and nothing else — the
 * contracts it refused were never terminated and must not be un-terminated on the way back.
 */
export const useTerminateManyContracts = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.contract.terminateMany({ ids }),
	touches: ['contracts', 'units'],
	inverse: ({ result }) =>
		// nothing changed, so there is nothing to offer taking back. An undo entry for a no-op is
		// a control that appears to have done something.
		result.terminated.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.terminatedMany({ count: result.terminated.length }),
					undo: () => api.contract.unterminateMany({ ids: toContractIds(result.terminated) }),
					redo: () => api.contract.terminateMany({ ids: toContractIds(result.terminated) }),
					records: (direction) =>
						result.terminated.map((contract) =>
							toContractHistoryEntry(contract, direction === 'undo' ? 'unterminated' : 'terminated')
						)
				},
	// one entry per contract that actually changed, so each record's own account carries what
	// happened to it — a selection is how the reader acted, not something the records share.
	records: ({ result }) =>
		result.terminated.map((contract) => toContractHistoryEntry(contract, 'terminated')),
	// what it turned away that the confirmation did not show, which is the workspace having
	// moved while the reader was deciding.
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.govId.trim()),
	toast: {
		// the count, because it is the one thing about a bulk action a reader cannot see for
		// themselves, and nothing at all where the selection turned out to hold nothing this could
		// be done to. The confirmation has already said why in that case.
		success: ({ result }) =>
			result.terminated.length > 0
				? get(LL).contracts.hooks.terminateManySuccess({ count: result.terminated.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Restore every terminated contract in the selection, as one change.
 *
 * The same procedure that undoes a bulk termination, because they are the same act: what
 * separates them is only which one the reader asked for.
 */
export const useRestoreManyContracts = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.contract.unterminateMany({ ids }),
	touches: ['contracts', 'units'],
	inverse: ({ result }) =>
		result.unterminated.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.unterminatedMany({ count: result.unterminated.length }),
					undo: () => api.contract.terminateMany({ ids: toContractIds(result.unterminated) }),
					redo: () => api.contract.unterminateMany({ ids: toContractIds(result.unterminated) }),
					records: (direction) =>
						result.unterminated.map((contract) =>
							toContractHistoryEntry(contract, direction === 'undo' ? 'terminated' : 'unterminated')
						)
				},
	records: ({ result }) =>
		result.unterminated.map((contract) => toContractHistoryEntry(contract, 'unterminated')),
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.govId.trim()),
	toast: {
		success: ({ result }) =>
			result.unterminated.length > 0
				? get(LL).contracts.hooks.restoreManySuccess({ count: result.unterminated.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Delete every contract in the selection that nothing depends on, as one change.
 *
 * **Taking it back is all or nothing.** The inverse creates the whole set in one batch and throws
 * where any one of them cannot be put back, rather than restoring what it can and naming the
 * rest — which would leave the workspace in a shape neither the deletion nor the undo describes.
 * An inverse that throws stays on the stack, so the reader can deal with whatever refused it and
 * press undo again.
 *
 * The rows themselves are what the procedure answers with, because putting a record back means
 * putting it back as itself, by the identity it had (ADR 0026).
 */
export const useDeleteManyContracts = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.contract.deleteMany({ ids }),
	touches: ['contracts'],
	inverse: ({ result }) =>
		result.deleted.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.deletedMany({ count: result.deleted.length }),
					undo: () => api.contract.createMany({ contracts: result.deleted }),
					redo: () => api.contract.deleteMany({ ids: toContractIds(result.deleted) }),
					records: (direction) =>
						result.deleted.map((contract) =>
							toContractHistoryEntry(contract, direction === 'undo' ? 'created' : 'deleted')
						)
				},
	// the names are frozen here for the reason the whole entry is: a moment later the records are
	// gone, and an account that could only name what still exists could not report a deletion.
	records: ({ result }) =>
		result.deleted.map((contract) => toContractHistoryEntry(contract, 'deleted')),
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.govId.trim()),
	toast: {
		success: ({ result }) =>
			result.deleted.length > 0
				? get(LL).contracts.hooks.deleteManySuccess({ count: result.deleted.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUnterminateContract = declareMutation({
	mutate: (id: string) => api.contract.unterminate({ id }),
	touches: ['contracts', 'units'],
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.unterminated({ record: t.common.labels.contract() }),
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

export const useSetContractUnits = declareMutation({
	mutate: (data: Parameters<typeof api.contract.units.set>[0]) => api.contract.units.set(data),
	touches: ['contracts', 'units'],
	// the set the contract held before the change, which is what makes the inverse another set
	// rather than a sequence of removals and additions to replay in order.
	capture: (variables) => api.contract.units.getMany({ contractId: variables.contractId }),
	inverse: ({ variables, captured }) => ({
		describe: (t) => t.common.undo.assigned({ record: t.common.labels.contract() }),
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
