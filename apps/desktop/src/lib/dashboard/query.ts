import api from '$lib/api/caller';
import type { FilterPeriod } from '$lib/api/period';
import { workspacePrefixes } from '$lib/design/query';
import { createQuery } from '@tanstack/svelte-query';

// the key sits under the contract tree because everything the landing screen shows is
// derived from contracts: the workspace invalidation covers the contracts prefix and this
// with it.
/** every reading of the landing screen, whichever period it was asked about. */
const all = [...workspacePrefixes.contracts, 'dashboard'];

export const keys = {
	all,
	// the period is part of the key because it is part of the question: two periods are two
	// answers, and sharing a key would serve one of them under the other's name. Anything
	// invalidating the screen as a whole uses the prefix above, which covers all of them.
	get: (period: FilterPeriod) => [...all, period]
} as const;

/**
 * What the landing screen shows: a few contracts of each rank that needs attention today, what
 * each rank holds in full, and the portfolio figures above them.
 *
 * The read is bounded rather than searched — a response capped per rank cannot honestly answer a
 * search over every contract, and finding a contract is the contracts list's job.
 *
 * @param period which span the money figures answer about. The queue and the ranks are about
 * today whatever it is: a contract needs attention now or it does not, and asking what needed
 * attention last month is a different screen.
 */
export function useFetchContractWorkQueue(period: () => FilterPeriod) {
	return createQuery(() => {
		const chosen = period();

		return {
			queryKey: keys.get(chosen),
			queryFn: () => api.contract.dashboard({ period: chosen }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}
