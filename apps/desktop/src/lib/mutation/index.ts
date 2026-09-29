/**
 * The mutation capability: how a data mutation is declared, what it announces, and the workspace
 * query-cache policy that keeps cached data truthful. A concept declares each mutation through
 * `declareMutation` and composes its query keys from `prefixOf`, over the prefixes `$lib/app`
 * builds from what features declare and provides. What a declaration's
 * `inverse` leaves goes onto the undo stack through `$lib/undo`, which owns taking it back. This
 * file is its whole API; a concept imports `$lib/mutation` and never a file inside it.
 */
export {
	declareMutation,
	type MutationChange,
	type MutationDeclaration,
	type MutationToast,
	type WorkspaceConcept
} from './mutation';
export {
	describeOutcomeChange,
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from './announcement';
export {
	createCachePolicy,
	invalidateRoot,
	prefixOf,
	provideCachePolicy,
	sharedPrefix,
	trustWorkspaceData,
	type CachePolicy
} from './cache';
