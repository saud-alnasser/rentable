import type { QueryClient } from '@tanstack/svelte-query';

/**
 * WORKSPACE QUERY CACHE
 *
 * there is no server and no writer this application cannot see, so workspace data is
 * cached indefinitely and kept truthful by its writers instead of by refetching on
 * every mount. the writers are enumerable: every data mutation announces itself through
 * `invalidateWorkspaceData`, and a pass that rewrites derived state with no touch-set to
 * name — a remote-sync pull, a UTC-day crossing — announces itself through
 * `invalidateRoot`. a mutation path that skips its writer shows wrong data, not slow
 * data, which is why the prefixes below are defined once: the domain query modules
 * compose their key sets from them, so the keys and the invalidation that must match
 * them cannot drift apart.
 *
 * settings, backups, and remote-sync state are outside this policy and keep their own
 * keys and invalidations.
 */

/** the key prefix of each data concept — the single authority the key sets build on. */
export const workspacePrefixes = {
	contracts: ['contracts'],
	payments: ['contracts', 'payments'],
	tenants: ['tenants'],
	complexes: ['complexes'],
	units: ['complexes', 'units']
} as const;

/** cache workspace data until a writer says otherwise. called once, on the app's client. */
export function trustWorkspaceData(client: QueryClient): void {
	for (const prefix of Object.values(workspacePrefixes)) {
		client.setQueryDefaults(prefix, { staleTime: Infinity });
	}
}

/** the writer every data mutation calls: invalidate every data-concept prefix. */
export async function invalidateWorkspaceData(client: QueryClient): Promise<void> {
	await Promise.all(
		Object.values(workspacePrefixes).map((queryKey) => client.invalidateQueries({ queryKey }))
	);
}

/**
 * the writer for a full pass with no touch-set: after a remote-sync pull or a day-crossing
 * reconcile every cached row is suspect, so everything — settings keys included — refetches.
 */
export async function invalidateRoot(client: QueryClient): Promise<void> {
	await client.invalidateQueries();
}
