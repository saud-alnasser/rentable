import api from '$lib/api/caller';
import type { FilterPeriod } from '$lib/date';
import { sharedPrefix } from '$lib/mutation';
import { createQuery } from '@tanstack/svelte-query';

// the key sits under the prefix the cache policy keeps for keys of no kind of their own, the
// contract tree, because everything the landing screen shows is derived from contracts: the
// workspace invalidation covers that prefix and this with it.
/** every reading of the landing screen, whichever period it was asked about. */
const all = () => [...sharedPrefix(), 'dashboard'];

export const keys = {
	get all() {
		return all();
	},
	// the period is part of the key because it is part of the question: two periods are two
	// answers, and sharing a key would serve one of them under the other's name. Anything
	// invalidating the screen as a whole uses the prefix above, which covers all of them.
	get: (period: FilterPeriod) => [...all(), period]
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
			queryFn: () => api.dashboard.get({ period: chosen }),
			// the answer for the period the reader left is held while the new one is on its way, so
			// the band keeps its cards and the period control. It is another period's answer, so
			// the screen draws none of its figures: it reads `isPlaceholderData` and draws the
			// loading treatment in their place (ticket 22 of effort 861).
			placeholderData: <T>(previous: T) => previous
		};
	});
}
