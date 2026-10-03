import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { OrganizationMember, OrganizationWorkspace } from '$lib/organization/host';
import { permits, WRITE_FLAGS } from '@rentable/workspace-permission';

/**
 * WHAT A WORKSPACE SAYS OF ITSELF TO WHOEVER IS READING
 *
 * The facts a workspace's card and its page both state (effort 846, requirement 16 and ticket 49),
 * read here once so the two cannot word them differently.
 */

/** what the reader may do in a workspace, as a kind a test or a style can key on. */
export type WorkspaceAccessKind = 'owner' | 'read' | 'pinned' | 'edit';

/**
 * what the reader may do in a workspace, read off the session's own entry for it. The owner
 * first, since nothing is pinned or withheld from them; then a read-only grant; then anything
 * pinned for the reader there; then whether anything they hold there writes at all, so a role
 * that only views reads *you may read* under a full grant rather than an edit it cannot make.
 * Worded as what they may do, never *full access* or *no access*, which the member's card does
 * not say either.
 */
export function workspaceAccessOf(
	workspace: OrganizationWorkspace,
	isOwner: boolean,
	t: TranslationFunctions
): { kind: WorkspaceAccessKind; word: string } {
	const words = t.organization.dashboard;

	if (isOwner) return { kind: 'owner', word: words.workspaceYouOwn() };
	if (workspace.accessLevel === 'read-only')
		return { kind: 'read', word: words.workspaceYouRead() };
	if (workspace.pinned !== 0) return { kind: 'pinned', word: words.workspaceSetForYou() };
	if (!WRITE_FLAGS.some((flag) => permits(workspace.permissions, flag)))
		return { kind: 'read', word: words.workspaceYouRead() };

	return { kind: 'edit', word: words.workspaceYouEdit() };
}

/** how many people hold a grant on a workspace, counted off the organization's own list. */
export const holderCount = (members: readonly OrganizationMember[], workspaceId: string) =>
	members.filter((member) => member.workspaces.some((held) => held.id === workspaceId)).length;
