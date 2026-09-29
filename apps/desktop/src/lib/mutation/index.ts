/**
 * The mutation capability: how a data mutation is declared, what it announces, and the workspace
 * query-cache policy that keeps cached data truthful. A concept composes its query keys from
 * `prefixOf`, over the prefixes `$lib/app` builds from what features declare and provides, and
 * declares each mutation through `declareMutation`. What a declaration's `inverse` leaves goes onto
 * the undo stack through `$lib/undo`, which owns taking it back.
 *
 * This file holds what loads under Node, the cache policy and the declaration's types; declaring a
 * mutation and announcing its outcome raise toasts, so they are the window's, in `./ui`. A concept
 * imports `$lib/mutation` or `$lib/mutation/ui` and never a file inside it.
 */
export type {
	MutationChange,
	MutationDeclaration,
	MutationToast,
	WorkspaceConcept
} from './mutation';
export type { MutationOptions } from './announcement';
export {
	createCachePolicy,
	invalidateRoot,
	prefixOf,
	provideCachePolicy,
	sharedPrefix,
	trustWorkspaceData,
	type CachePolicy
} from './cache';
