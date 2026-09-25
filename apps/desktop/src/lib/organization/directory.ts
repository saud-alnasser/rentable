import type { ListSort } from '@rentable/design/sort.js';
import { matchesTerm } from '$lib/layout/palette';
import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';

/**
 * THE SETTINGS DIRECTORIES, SEARCHED AND ORDERED
 *
 * What the members and workspaces directories show for a search and an order. Both sets are the
 * whole of what the session already holds (an organization's accounts, and the workspaces this
 * member is granted), so they are narrowed in memory rather than by a read, through the one
 * comparison the palette uses for text in memory: folded on both sides, so a term typed in
 * Arabic-Indic digits or with a different alef finds what its other spelling finds.
 *
 * Here rather than in the components so the rule can be checked from a test that runs under Node.
 */

/** the orders the members directory offers, by the id its sort control names. */
export const MEMBER_SORTS = ['username', 'role'] as const;

/** the orders the workspaces directory offers. */
export const WORKSPACE_SORTS = ['name', 'members'] as const;

/** the direction a sort asks for, as a factor on a comparison. */
const factorOf = (sort: ListSort) => (sort.direction === 'asc' ? 1 : -1);

/**
 * a plain comparison of two names rather than a locale-aware one, so the order does not change
 * when the reader changes language. A username is the ASCII the username rules allow.
 */
function compareText(one: string, other: string) {
	const a = one.toLowerCase();
	const b = other.toLowerCase();

	return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * The members a directory shows: those the term finds, in the order chosen.
 *
 * A member is found by their username or by what their role is called, so typing *manag* finds
 * every manager. With no order chosen the set keeps the order it arrived in.
 *
 * @param roleLabel what a member's role is called in the reader's language.
 */
export function toMemberDirectory(
	members: readonly OrganizationMember[],
	term: string,
	sort: ListSort | null,
	roleLabel: (member: OrganizationMember) => string
): OrganizationMember[] {
	const found = members.filter(
		(member) => matchesTerm(member.username, term) || matchesTerm(roleLabel(member), term)
	);

	if (!sort) {
		return found;
	}

	const factor = factorOf(sort);

	return [...found].sort((one, other) => {
		if (sort.columnId === 'role') {
			// the most authority first: the rank the member's role stands at, which orders a custom
			// role between the member and the manager as the roles list does.
			const byRole = other.rank - one.rank;

			if (byRole !== 0) {
				return byRole * factor;
			}
		}

		return compareText(one.username, other.username) * factor;
	});
}

/**
 * The workspaces a directory shows: those whose name the term finds, in the order chosen.
 *
 * @param memberCount how many people hold a workspace, which the *members* order sorts by.
 */
export function toWorkspaceDirectory(
	workspaces: readonly OrganizationWorkspace[],
	term: string,
	sort: ListSort | null,
	memberCount: (workspaceId: string) => number
): OrganizationWorkspace[] {
	const found = workspaces.filter((workspace) => matchesTerm(workspace.name, term));

	if (!sort) {
		return found;
	}

	const factor = factorOf(sort);

	return [...found].sort((one, other) => {
		if (sort.columnId === 'members') {
			const byCount = memberCount(one.id) - memberCount(other.id);

			if (byCount !== 0) {
				return byCount * factor;
			}
		}

		return compareText(one.name, other.name) * factor;
	});
}
