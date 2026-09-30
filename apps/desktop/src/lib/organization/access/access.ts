import {
	RECORD_FLAGS,
	WRITE_FLAGS,
	effectiveIn,
	effectiveInWorkspace,
	maskOf,
	permits,
	type AccessLevel,
	type Flag
} from '@rentable/workspace-permission';

/**
 * WHAT A MEMBER MAY DO IN ONE WORKSPACE, AS THEIR CARD SETS IT
 *
 * A member's permissions are three layers (effort 838, requirement 12 as amended a third time):
 * their role, what is changed for them across the organization, and what is set for them in one
 * workspace. The last pins record flags: a flag pinned holds the value it was set to there however
 * the layers beneath it move, and one not pinned follows them (`effectiveInWorkspace`). Their
 * grant then folds it: a grant minted read only before the lock left clears every add, edit and
 * delete there (`effectiveIn`). The card draws the result as the switch list's record groups.
 *
 * **What is pinned is what differs** (requirement 12 as amended a fourth time 2026-09-28, the
 * human's call on the running application): a workspace's pins are exactly the switches that
 * differ from what the member holds across the organization when the card is saved, so a switch
 * turned back unsets its pin rather than pinning it at the value it already follows. *At review
 * round one of ticket 54 a switch turned was pinned at its new value and stayed pinned when turned
 * back, with a reset and a read only preset beside the switches to clear or set them together;
 * the fourth amendment took both presets away with that rule.*
 */

/**
 * one workspace a member is in, as the card sets it: the grant's level, the record flags pinned
 * there, and which of those are on.
 */
export type WorkspaceTailoring = { access: AccessLevel; pinned: number; granted: number };

/** the record flags of a mask, and nothing else: what a workspace can set. */
export const recordsOf = (mask: number): number =>
	maskOf(...RECORD_FLAGS.filter((flag) => permits(mask, flag)));

/** whether a mask adds, edits or deletes any kind of record. */
export const writesAny = (mask: number): boolean => WRITE_FLAGS.some((flag) => permits(mask, flag));

/** every record flag pinned in any of these workspaces: what clearing all of them unpins. */
export const pinnedAcross = (workspaces: readonly { pinned: number }[]): number =>
	maskOf(...RECORD_FLAGS.filter((flag) => workspaces.some(({ pinned }) => permits(pinned, flag))));

/** what the member may do with records in the workspace, as the switches draw it. */
export const tailoredShown = (organizationWide: number, tailoring: WorkspaceTailoring): number =>
	recordsOf(
		effectiveIn(
			effectiveInWorkspace(organizationWide, tailoring.pinned, tailoring.granted),
			tailoring.access
		)
	);

/**
 * whether anything is set for the member in the workspace, or it draws differently from what they
 * may do across the organization, as a grant minted read only does.
 */
export const isTailored = (organizationWide: number, tailoring: WorkspaceTailoring): boolean =>
	tailoring.pinned !== 0 ||
	tailoredShown(organizationWide, tailoring) !==
		tailoredShown(organizationWide, { access: 'full-access', pinned: 0, granted: 0 });

/** the record flags two masks differ on, as a mask. */
const differing = (left: number, right: number): number =>
	maskOf(...RECORD_FLAGS.filter((flag) => permits(left, flag) !== permits(right, flag)));

/**
 * What a workspace comes to where its switches show `shown` (record flags), against what the
 * member may do across the organization and the grant's level it holds (`held`).
 *
 * - **At full access, or where a write is shown on, it is a full-access grant.** A grant minted
 *   read only becomes one here (requirement 12 as amended a third time); one with every write
 *   left off stays read only.
 * - **Pinned is what differs**, each at the value shown: the switches measured against what the
 *   member holds with nothing pinned at that level, so a switch that agrees with it is not set.
 *   Over a grant minted read only that a write turns to full access, every write it was clearing
 *   and the organization gives now differs, and is pinned off, so the member ends up with exactly
 *   what the switches show.
 *
 * *A second pass pins what a mask stored before a write needed its view makes the first miss: a
 *   write carried without its view is dropped while nothing is pinned, and comes back when its
 *   view is pinned on, unless it is pinned off too.*
 */
export const tailoredTo = (
	organizationWide: number,
	held: AccessLevel,
	shown: number
): WorkspaceTailoring => {
	const access: AccessLevel =
		held === 'full-access' || writesAny(shown) ? 'full-access' : 'read-only';
	const pinnedOnly = (pinned: number): WorkspaceTailoring => ({
		access,
		pinned,
		granted: maskOf(...RECORD_FLAGS.filter((flag) => permits(pinned, flag) && permits(shown, flag)))
	});
	const first = pinnedOnly(
		differing(tailoredShown(organizationWide, { access, pinned: 0, granted: 0 }), shown)
	);

	const missed = differing(tailoredShown(organizationWide, first), shown);

	return pinnedOnly(
		maskOf(...RECORD_FLAGS.filter((flag) => permits(first.pinned, flag) || permits(missed, flag)))
	);
};

/**
 * The first flag writing a workspace's pins would need the reader to hold and they do not, or
 * `null`: every flag pinned or unpinned, every flag whose pinned value moves, and every flag the
 * row pins after, since the row is signed under the reader's certificate (Rust's
 * `set_workspace_override`). Nothing is written where the pins do not change.
 */
export const firstUnheldTailored = (
	held: number,
	before: Pick<WorkspaceTailoring, 'pinned' | 'granted'>,
	after: Pick<WorkspaceTailoring, 'pinned' | 'granted'>
): Flag | null =>
	before.pinned === after.pinned && before.granted === after.granted
		? null
		: (RECORD_FLAGS.find(
				(flag) =>
					(permits(before.pinned, flag) !== permits(after.pinned, flag) ||
						permits(before.granted, flag) !== permits(after.granted, flag) ||
						permits(after.pinned, flag)) &&
					!permits(held, flag)
			) ?? null);

/**
 * The first flag pinned in any workspace that the reader does not hold, or `null`: what giving the
 * member another role, or resetting them to theirs, would unpin, and Rust refuses the act for
 * (`role/`, the clearing in `apply`).
 */
export const firstUnheldPinned = (held: number, pinned: number): Flag | null =>
	RECORD_FLAGS.find((flag) => permits(pinned, flag) && !permits(held, flag)) ?? null;
