import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { keys, rolesAndMembersChanged } from '$lib/organization/query';
import { get } from 'svelte/store';

/**
 * WHO HOLDS WHICH WORKSPACE, AND WHAT IS SET FOR THEM THERE
 *
 * A member's grants, written from either end, and what is pinned for them in one workspace.
 */

/**
 * set what is pinned for one member in one workspace they are in, and which of it is on, nothing
 * pinned clearing it (effort 838, requirement 12 as amended a third time, and at review round
 * one). The member's card writes one per workspace it tailored. The members are read again, since
 * each carries what is pinned for it per workspace.
 */
export const useSetWorkspaceOverride = declareMutation({
	mutate: ({
		memberId,
		workspaceId,
		pinned,
		granted
	}: {
		memberId: string;
		workspaceId: string;
		pinned: number;
		granted: number;
	}) =>
		api.organization.member.setWorkspaceOverride({
			memberId,
			workspaceId,
			pinned,
			granted
		}),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.overrideSaved(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: rolesAndMembersChanged
});

/**
 * one member's access on one workspace, as a dialog hands the change back. `none` is the grant
 * coming back.
 */
export type AccessChange = {
	workspaceId: string;
	memberId: string;
	access: 'none' | 'full-access' | 'read-only';
};

/**
 * write a set of access changes and say once that they were saved.
 *
 * **One mutation over the set rather than one per grant**, and that is what it is for: the two
 * sections ask the same question from opposite ends, the members section *what does this person
 * hold* and the workspaces section *who holds this*, and both end in the same two procedures. A
 * hook per procedure would announce N times or announce nothing and leave the sentence to the
 * surface, which is the direct `toast` call [[rules/frontend]] forbids under *Data access*.
 *
 * **In order and not in parallel**, so a refusal on one is the first thing the reader hears about
 * rather than the last of several, and the writes that had already gone through stand. Minting a
 * read-only credential is the owner's and is refused by name, which the shared handler shows.
 *
 * The session's own workspaces are read from the state key, so it is refreshed beside the list: a
 * reader who granted themselves a workspace should find it on the switcher without a relaunch.
 * Both are refreshed whether the set went through or was refused part way, since what was written
 * before the refusal stands.
 */
export const useChangeAccess = declareMutation({
	mutate: async ({ changes }: { changes: AccessChange[] }) => {
		for (const change of changes) {
			if (change.access === 'none') {
				await api.organization.workspace.withdraw({
					workspaceId: change.workspaceId,
					memberId: change.memberId
				});
			} else {
				await api.organization.workspace.grant({
					workspaceId: change.workspaceId,
					memberId: change.memberId,
					access: change.access
				});
			}
		}
	},
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.accessSaved(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	// on a refusal part way as much as on success: the writes before the refusal stand, and a
	// list left as it was would show the reader an access the row no longer has.
	settled: [keys.members, keys.state]
});
