import type { OrganizationSession } from '$lib/organization/host';
import { permits, type Flag } from '@rentable/workspace-permission';

/**
 * A MEMBER'S CARD, AND WHO HAS ANYTHING TO DO ON A DIRECTORY OF THEM
 *
 * What one save of a member's card writes of their role and override, and whether a reader is
 * offered the members directory at all. What a role and a flag are called is `../role/role.ts`;
 * what is set for a member in one workspace is `../access/access.ts`.
 */

/** what a member's card has on it at a save, and what their row holds. */
type MemberChoice = { roleId: string; override: number };

/**
 * What one save of a member's card writes of their role and override (effort 838, requirements
 * 5 and 6).
 *
 * - **A changed role is one act, with the override the switches come to** wherever that is not
 *   nothing and the reader may override. Rust's `assign_role` clears the override where none is
 *   sent (requirement 6 as amended 2026-09-27), so an override equal to the one the member had
 *   is still sent: it is no longer what the new role leaves them with.
 * - **An override changed on its own is its own write.**
 */
export const memberWritesOf = (
	saved: MemberChoice,
	edit: MemberChoice,
	may: { canAssignRole: boolean; canOverride: boolean }
): {
	assign: { roleId: string; override: number | undefined } | null;
	override: number | null;
} => {
	if (may.canAssignRole && edit.roleId !== saved.roleId) {
		return {
			assign: {
				roleId: edit.roleId,
				override: may.canOverride && edit.override !== 0 ? edit.override : undefined
			},
			override: null
		};
	}

	return {
		assign: null,
		override: may.canOverride && edit.override !== saved.override ? edit.override : null
	};
};

/**
 * The acts that make the members directory worth drawing.
 *
 * `renameWorkspace` is deliberately absent: it is the workspaces section's act, and a member who
 * holds it alone has nothing to do on a list of people.
 */
const MEMBER_ACTS = [
	'inviteMember',
	'removeMember',
	'assignRole',
	'overrideMember',
	'resetPassword',
	'renameMember',
	'grantWorkspace'
] as const satisfies readonly Flag[];

/**
 * Whether this reader has anything to do on a directory of people.
 *
 * It gated the members section while there was one. The directory is a block of the organization
 * section now, so the same answer gates the block, and the section itself is offered to anybody
 * signed in: what else it holds, the sync status and the way out of the organization, is read by
 * every member.
 */
export function administersMembers(session: OrganizationSession | null): boolean {
	return MEMBER_ACTS.some((act) => permits(session?.permissions ?? 0, act));
}
