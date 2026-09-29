import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation';
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
	inverse: ({ variables, result }) => ({
		describe: (t) => t.common.undo.renewed({ record: t.common.labels.contract() }),
		flags: { undo: ['deleteContract'], redo: ['editContract'] },
		// one delete, as a creation's undo is: it releases the successor's units in the same batch.
		undo: () => api.contract.delete({ id: result.id }),
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
