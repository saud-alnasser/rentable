import api from '$lib/api/caller';
import { keys } from '$lib/contract/query';
import { useQueryClient } from '@tanstack/svelte-query';

/**
 * Read what a printed schedule carries besides the contract: its cycles and the units it holds.
 * Once, for the contract host printing it, under the keys the schedule pane and the units pane
 * read, so a contract whose record is open is not read twice.
 */
export function useReadContractSchedule() {
	const client = useQueryClient();

	return {
		cycles: (id: string) =>
			client.fetchQuery({
				queryKey: keys.getSchedule(id),
				queryFn: () => api.contract.schedule({ id })
			}),
		units: (id: string) =>
			client.fetchQuery({
				queryKey: keys.getUnits(id),
				queryFn: () => api.contract.units.getMany({ contractId: id })
			})
	};
}

/**
 * Read what a reminder to a contract's tenant states, once, for the contract host as it opens
 * WhatsApp. Under the contracts prefix, so a payment or an edit anywhere makes the next reading
 * fresh rather than stating yesterday's amount.
 */
export function useReadContractReminder() {
	const client = useQueryClient();

	return (id: string) =>
		client.fetchQuery({
			queryKey: keys.getReminder(id),
			queryFn: () => api.contract.reminder({ id })
		});
}
