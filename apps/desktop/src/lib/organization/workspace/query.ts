import api from '$lib/api/caller';
import { type MutationOptions } from '$lib/mutation';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { keys } from '$lib/organization/query';
import type { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE ORGANIZATION'S WORKSPACES, CREATED AND DELETED
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
	invalidates: [keys.state]
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
 * and the rail's switcher reads the same key.
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
	invalidates: [keys.state]
});
