import contract from '$lib/contract/feature';
import { createCachePolicy, provideCachePolicy } from '$lib/mutation';
import { features } from './features';

/**
 * THE CACHE POLICY
 *
 * builds the workspace query-cache policy from what the features declare and provides it to
 * `$lib/mutation`, which invalidates and keys by it. It runs once, when this module is first
 * evaluated, and the root layout imports it right after `$lib/app/caller`, so the policy is in
 * place before any component can read a key or run a mutation.
 *
 * A key belonging to no record kind, the landing screen's and the history's, sits under the
 * contract's prefix, which the workspace invalidation covers.
 */
export const cachePolicy = createCachePolicy(features, contract);

provideCachePolicy(cachePolicy);
