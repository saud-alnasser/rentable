import type { ListSort } from '@rentable/design/sort.js';
import { matchesTerm } from '$lib/layout/palette';
import { byRank } from '$lib/organization/role';
import type {
	OrganizationMember,
	OrganizationRole,
	OrganizationWorkspace
} from '$lib/platform/host';

/**
 * THE SETTINGS DIRECTORIES, SEARCHED AND ORDERED
 *
 * What the members, workspaces and roles directories show for a search and an order. Each set is
 * the whole of what the session already holds (an organization's accounts, the workspaces this
 * member is granted, and the organization's roles), so they are narrowed in memory rather than by
 * a read, through the one comparison the palette uses for text in memory: folded on both sides, so
 * a term typed in Arabic-Indic digits or with a different alef finds what its other spelling finds.
 *
 * Here rather than in the components so the rule can be checked from a test that runs under Node.
 */

/** the orders the members directory offers, by the id its sort control names. */
export const MEMBER_SORTS = ['username', 'role'] as const;

/** the orders the workspaces directory offers. */
export const WORKSPACE_SORTS = ['name', 'members'] as const;

/** the orders the roles directory offers; with neither chosen it stands by rank. */
export const ROLE_SORTS = ['rank', 'name'] as const;

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

/**
 * The roles a directory shows: those whose name the term finds, in the order chosen.
 *
 * **With no order chosen the roles stand by rank, highest first**, since the ranking is what the
 * list is for; the *rank* order says the same thing on the control, and reverses it.
 *
 * @param nameOf what a role is called in the reader's language: a built-in role's name is the
 *   interface's, and a role the organization made is called what it was named.
 */
export function toRoleDirectory(
	roles: readonly OrganizationRole[],
	term: string,
	sort: ListSort | null,
	nameOf: (role: OrganizationRole) => string
): OrganizationRole[] {
	const found = byRank(roles).filter((role) => matchesTerm(nameOf(role), term));

	if (!sort) {
		return found;
	}

	const factor = factorOf(sort);

	return [...found].sort((one, other) => {
		if (sort.columnId === 'name') {
			const byName = compareText(nameOf(one), nameOf(other));

			if (byName !== 0) {
				return byName * factor;
			}
		}

		// the most authority first, as the members directory's *role* order is.
		return (other.rank - one.rank) * factor;
	});
}
