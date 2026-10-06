import api from '$lib/api/caller';
import { type MutationOptions } from '$lib/mutation';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { consentLostRereadsTheState, organizationChanged } from '$lib/organization/query';
import { syncKeys } from '$lib/sync/ui';
import type { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE ORGANIZATION'S WORKSPACES, CREATED, RENAMED AND DELETED
 *
 * Granting and withdrawing one is the access sub-concept's (`../access/query.ts`); opening one is
 * the sign-in path's.
 */

const createWorkspace = declareMutation({
	mutate: ({ name }: { name: string }) => api.organization.workspace.create({ name }),
	touches: 'none',
	toast: {
		success: () => get(LL).layout.noWorkspace.created(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged],
	failed: consentLostRereadsTheState
});

/**
 * create the first workspace, or another. The refusal a person can act on, an owner elsewhere,
 * arrives as `BAD_REQUEST` or a forbidden and is shown; everything else reads as unexpected.
 *
 * **The client is a parameter, because the root layout is a caller.** Every other hook reads the
 * client from context, which is right for anything drawn inside the provider. The layout is what
 * draws the provider, so its own script sits above the context it would read, and a hook held
 * there without the client found none and failed the whole application before its window was
 * shown. Handing the client in is the same override `createMutation` offers, made explicit here
 * so the next caller above the provider does not rediscover it.
 */
export function useCreateWorkspace(queryClient?: QueryClient, opts?: MutationOptions) {
	// the client the caller handed in, or the one in context: either way it is the one whose
	// state key the rail's switcher, the page's list and the invite's checkboxes read.
	return createWorkspace(opts, queryClient);
}

/**
 * delete a workspace and the database it lives on.
 *
 * **The owner's, and refused in Rust before anything is deleted**: the delete reaches Turso
 * through the one intent the credentials rule permits, and the authority for it lives on the
 * owner's machine. The confirm that asks first is the workspaces section's, and it names what is
 * lost; the refusal a person can act on arrives as a forbidden and is shown.
 *
 * It invalidates where the machine stands rather than a list of workspaces, because there is no
 * such list: the workspaces a member holds are part of the session the state query answers with,
 * and the rail's switcher reads the same key. The members are read with it, since each member's
 * grants and every card's count of who holds a workspace are read off them (`organizationChanged`).
 */
export const useDeleteWorkspace = declareMutation({
	mutate: ({ workspaceId }: { workspaceId: string }) =>
		api.organization.workspace.remove({ workspaceId }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.workspaceDeleted(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged],
	failed: consentLostRereadsTheState
});

/**
 * Call this machine's workspace something else.
 *
 * **It refreshes the replica's state and the organization's, rather than a workspace key.** The
 * sidebar header and the workspace menu draw the name from the one query `sync/query.ts` holds,
 * and the workspaces section's cards, the rail's switcher and the workspace page draw it from the
 * workspaces the session lists, which is the organization's state: the name is a row of the
 * organization's database, and the rename writes it there. Refreshing the replica's alone left the
 * card on the old name until the section was drawn again, and that is why it is declared here,
 * beside the organization's other writes, rather than in `workspace/query.ts`, where it sat from
 * effort 840 (ticket 38) until effort 851. It sat beside `useSyncWorkspace` in
 * `settings/query.ts` before that.
 *
 * The refusal is the shared handler's: the procedure's own bound raises `BAD_REQUEST`, which
 * reaches the reader as the message it was raised with, and anything else reads as an unexpected
 * failure. What a reader actually meets for a name that is empty or too long is the form's own
 * validation, on the field they typed in, before any of this runs.
 */
export const useRenameWorkspace = declareMutation({
	mutate: ({ name }: { name: string }) => api.sync.rename({ name }),
	touches: 'none',
	toast: {
		success: () => get(LL).workspace.renamed(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	// the replica's state written before the invalidation as well as after it: the surfaces drawing
	// the name from it are on screen while this resolves, and the refetch is a round trip they would
	// otherwise spend showing the old one. The rename answers with the replica's state alone, so the
	// organization's is read again rather than written, with the members and the roles.
	sets: ({ result }) => [{ key: syncKeys.remoteSync, data: result }],
	invalidates: [syncKeys.remoteSync, organizationChanged]
});
