import type { Feature } from '$lib/feature/feature';
import type { RecordKind } from '$lib/permission';
import type { QueryClient } from '@tanstack/svelte-query';

/**
 * WORKSPACE QUERY CACHE
 *
 * every writer of workspace data announces itself, so the data is cached indefinitely and
 * kept truthful by those writers instead of by refetching on every mount. the enumeration
 * being *complete* is what the policy rests on, not the enumeration being short: every data
 * mutation announces itself through `invalidateWorkspaceData`, and a pass that rewrites
 * derived state with no touch-set to name — a remote-sync pull, a UTC-day crossing — announces
 * itself through `invalidateRoot`. a workspace whose record of truth is remote adds a writer
 * this machine cannot see, another device, and it announces itself the same way: through the
 * pull that brings its rows in. a mutation path that skips its writer shows wrong data, not slow
 * data, which is why each prefix is declared once, in its feature's own declaration: the domain
 * query modules compose their key sets from {@link prefixOf}, and the invalidation that must
 * match them reads the same declarations, so the two cannot drift apart.
 *
 * **The prefixes are handed over, never imported.** They are what features declare, and this
 * capability sits below the features, so `$lib/app` builds the policy from its list with
 * {@link createCachePolicy} and provides it once, as the root layout loads and before anything
 * has rendered. Nothing here reads a prefix while a module is being evaluated: every read is a
 * call, made by a query or a mutation that runs after the policy is in place, and a read made
 * before it throws rather than answering with nothing.
 *
 * settings and remote-sync state are outside this policy and keep their own keys and
 * invalidations.
 */

/** What the workspace invalidation and every workspace query key are built on. */
export type CachePolicy = {
	/** every declared prefix, in the order the features are listed, which is the order they are invalidated in */
	prefixes: readonly (readonly string[])[];
	/** each record kind's prefix */
	kinds: ReadonlyMap<RecordKind, readonly string[]>;
	/**
	 * the prefix a key belonging to no record kind sits under, the landing screen's and the
	 * history's, so the workspace invalidation covers it with the rest.
	 */
	shared: readonly string[];
};

/**
 * Build the policy from what the features declare: each one's prefix, in list order, and the
 * feature whose prefix a key of no kind of its own sits under.
 */
export function createCachePolicy(
	features: readonly Feature[],
	shared: Feature & { prefix: readonly string[] }
): CachePolicy {
	const declared = features.flatMap(({ kind, prefix }) => (prefix ? [{ kind, prefix }] : []));

	return {
		prefixes: declared.map(({ prefix }) => prefix),
		kinds: new Map(declared.flatMap(({ kind, prefix }) => (kind ? [[kind, prefix]] : []))),
		shared: shared.prefix
	};
}

let provided: CachePolicy | null = null;

/** Provide the policy. Called once, by `$lib/app/cache`, and by a test that reads a key. */
export function provideCachePolicy(policy: CachePolicy): void {
	provided = policy;
}

function policy(): CachePolicy {
	if (provided === null) {
		throw new Error(
			'the workspace cache policy was read before it was provided: import `$lib/app/cache` first'
		);
	}

	return provided;
}

/** the prefix a record kind's query keys start with, as its feature declares it. */
export function prefixOf(kind: RecordKind): readonly string[] {
	const prefix = policy().kinds.get(kind);

	if (prefix === undefined) {
		throw new Error(`no feature declares the cache prefix of the ${kind} kind`);
	}

	return prefix;
}

/** the prefix a key belonging to no record kind sits under. */
export function sharedPrefix(): readonly string[] {
	return policy().shared;
}

/** cache workspace data until a writer says otherwise. called once, on the app's client. */
export function trustWorkspaceData(client: QueryClient): void {
	for (const prefix of policy().prefixes) {
		client.setQueryDefaults(prefix, { staleTime: Infinity });
	}
}

/** the writer every data mutation calls: invalidate every data-concept prefix. */
export async function invalidateWorkspaceData(client: QueryClient): Promise<void> {
	await Promise.all(policy().prefixes.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/**
 * the writer for a full pass with no touch-set: after a remote-sync pull or a day-crossing
 * reconcile every cached row is suspect, so everything — settings keys included — refetches.
 */
export async function invalidateRoot(client: QueryClient): Promise<void> {
	await client.invalidateQueries();
}
