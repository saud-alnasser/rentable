import api from '$lib/api/caller';
import { toContractName } from '$lib/contract/query';
import { declareMutation, describeOutcomeChange } from '$lib/mutation/ui';
import type { SelectionCall } from '@rentable/design/selection.js';
import type { HistoryEntry } from '$lib/history';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

/**
 * WHAT A SELECTION OF CONTRACTS DOES
 *
 * the three actions a reader takes on a selection at once, each one change with one undo entry.
 * What one of them would do before it is done is `usePlanManyContracts`, beside the other reads.
 */

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
					flags: { undo: ['editContract'], redo: ['editContract'] },
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
					flags: { undo: ['editContract'], redo: ['editContract'] },
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
 * **Taking it back is all or nothing.** The inverse restores the whole set in one batch and throws
 * where any one of them cannot be put back, rather than restoring what it can and naming the
 * rest — which would leave the workspace in a shape neither the deletion nor the undo describes.
 * An inverse that throws stays on the stack, so the reader can deal with whatever refused it and
 * press undo again.
 *
 * The rows themselves are what the procedure answers with, each with the units it held, because
 * putting a record back means putting it back as itself, by the identity it had (ADR 0026), and
 * holding what it held.
 */
export const useDeleteManyContracts = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.contract.deleteMany({ ids }),
	touches: ['contracts', 'units'],
	inverse: ({ result }) =>
		result.deleted.length === 0
			? undefined
			: (() => {
					// what the last deletion took, which the next undo puts back: a redo is refused whatever
					// has come to hold one since and removes the rest, so the undo after it puts back only
					// those, and nothing where it removed nothing.
					let removed = result.deleted;

					return {
						describe: (t) => t.common.undo.deletedMany({ count: removed.length }),
						flags: { undo: ['editContract'], redo: ['deleteContract'] },
						undo: async () => {
							if (removed.length > 0) {
								await api.contract.restoreMany({ contracts: removed });
							}
						},
						redo: async () => {
							removed = (await api.contract.deleteMany({ ids: toContractIds(result.deleted) }))
								.deleted;
						},
						records: (direction) =>
							removed.map((contract) =>
								toContractHistoryEntry(contract, direction === 'undo' ? 'unterminated' : 'deleted')
							)
					};
				})(),
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
