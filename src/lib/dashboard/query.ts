import api from '$lib/api/caller';
import { workspacePrefixes } from '$lib/design/query';
import { createQuery } from '@tanstack/svelte-query';

// the key sits under the contract tree because everything the landing screen shows is
// derived from contracts: the workspace invalidation covers the contracts prefix and this
// with it.
export const keys = {
	get: [...workspacePrefixes.contracts, 'dashboard'],
	queue: (search: string) => [...workspacePrefixes.contracts, 'dashboard', search]
} as const;

/**
 * The landing screen's work queue for a search: the contracts needing action today, their
 * group headings, and the two portfolio figures above them.
 *
 * `placeholderData` holds the previous set while a new query is in flight, so the queue
 * keeps rendering rows instead of flashing through its loading state on every keystroke.
 */
export function useFetchContractWorkQueue(search: () => string = () => '') {
	return createQuery(() => {
		const trimmedSearch = search().trim();

		return {
			queryKey: keys.queue(trimmedSearch),
			queryFn: () => api.contract.dashboard({ search: trimmedSearch || undefined }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}
