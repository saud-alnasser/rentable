import api from '$lib/api/caller';
import { workspacePrefixes } from '$lib/design/query';
import { createQuery } from '@tanstack/svelte-query';

// the key sits under the contract tree because everything the landing screen shows is
// derived from contracts: the workspace invalidation covers the contracts prefix and this
// with it.
export const keys = {
	get: [...workspacePrefixes.contracts, 'dashboard']
} as const;

/**
 * What the landing screen shows: a few contracts of each rank that needs attention today, what
 * each rank holds in full, and the portfolio figures above them.
 *
 * The read is bounded rather than searched — a response capped per rank cannot honestly answer a
 * search over every contract, and finding a contract is the contracts list's job.
 */
export function useFetchContractWorkQueue() {
	return createQuery(() => ({
		queryKey: keys.get,
		queryFn: () => api.contract.dashboard()
	}));
}
