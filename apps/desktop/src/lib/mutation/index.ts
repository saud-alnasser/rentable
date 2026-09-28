/**
 * The mutation capability: how a data mutation is declared, what it announces, and the workspace
 * query-cache policy that keeps cached data truthful. A concept declares each mutation through
 * `declareMutation` and composes its query keys from `workspacePrefixes`. What a declaration's
 * `inverse` leaves goes onto the undo stack through `$lib/undo`, which owns taking it back. This
 * file is its whole API; a concept imports `$lib/mutation` and never a file inside it.
 */
export {
	declareMutation,
	describeOutcomeChange,
	onMutationError,
	onMutationSuccess,
	type MutationChange,
	type MutationDeclaration,
	type MutationOptions,
	type MutationToast,
	type WorkspaceConcept
} from './mutation';
export { invalidateRoot, trustWorkspaceData, workspacePrefixes } from './cache';
