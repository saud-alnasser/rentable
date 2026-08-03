import api from '$lib/api/caller';
import { createQuery } from '@tanstack/svelte-query';

export const keys = {
	get: ['contracts', 'dashboard']
} as const;

// the key sits under the contract tree because every figure on the dashboard is derived
// from contracts: a contract mutation invalidates `['contracts']` and this with it.
export function useFetchContractDashboard() {
	return createQuery(() => ({
		queryKey: keys.get,
		queryFn: () => api.contract.dashboard()
	}));
}
