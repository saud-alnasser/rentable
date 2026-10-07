import api from '$lib/api/caller';
import { toContractName } from '$lib/contract/query';
import type { HistoryEntry } from '$lib/history';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

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
	// the contract being renewed, read for its name: the renewal is on its account as well as on
	// the successor's, and the procedure answers with the successor alone.
	capture: (variables) => api.contract.get({ id: variables.contractId }),
	inverse: ({ variables, result, captured }) => ({
		describe: (t) => t.common.undo.renewed({ record: t.common.labels.contract() }),
		flags: { undo: ['deleteContract'], redo: ['editContract'] },
		// one delete, as a creation's undo is: it releases the successor's units in the same batch.
		undo: () => api.contract.delete({ id: result.id }),
		// renewed again with the identity it had, so a page still open on the successor is holding
		// a reference to the record rather than to a copy of it.
		redo: () => api.contract.renew({ ...variables, id: result.id }),
		// the undo deletes the successor and leaves the predecessor as it was, so only the successor
		// has anything to record; the redo renews again, which both have.
		records: (direction) =>
			direction === 'undo'
				? {
						concept: 'contract',
						recordId: result.id,
						action: 'deleted',
						record: toContractName(result)
					}
				: renewedOn(variables.contractId, captured, result)
	}),
	records: ({ variables, captured, result }) => renewedOn(variables.contractId, captured, result),
	toast: {
		success: () => get(LL).contracts.hooks.renewSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * A renewal as both contracts' accounts hold it: the one renewed, then the one it produced. The
 * predecessor is named as it was read before the renewal, and by the contract's own fallback where
 * that read found nothing.
 */
function renewedOn(
	predecessorId: string,
	predecessor: { govId?: string | null; tenantName?: string | null } | undefined,
	successor: { id: string; govId?: string | null; tenantName?: string | null }
): HistoryEntry[] {
	return [
		{
			concept: 'contract',
			recordId: predecessorId,
			action: 'renewed',
			record: toContractName(predecessor ?? {})
		},
		{
			concept: 'contract',
			recordId: successor.id,
			action: 'renewed',
			record: toContractName(successor)
		}
	];
}
