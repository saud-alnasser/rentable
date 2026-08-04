import api from '$lib/api/caller';
import { workspacePrefixes } from '$lib/design/query';
import { createQuery } from '@tanstack/svelte-query';

export const keys = {
	get: [...workspacePrefixes.contracts, 'dashboard']
} as const;

// the key sits under the contract tree because every figure on the dashboard is derived
// from contracts: the workspace invalidation covers the contracts prefix and this with it.
export function useFetchContractDashboard() {
	return createQuery(() => ({
		queryKey: keys.get,
		queryFn: () => api.contract.dashboard()
	}));
}
