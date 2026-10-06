import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import type { MemberRemoved, SessionsEnded } from '$lib/organization/host';
import { consentLostRereadsTheState, keys, organizationChanged } from '$lib/organization/query';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE ORGANIZATION'S MEMBERS
 *
 * Every account and where it stands, and the writes a member's card makes: making one, its name,
 * its role and override, its way in, the handover, and removing it.
 */

/**
 * what signing a member out of every machine says, from their row: the sentence the reader's own
 * sign-out says (`endedSentence` in `../session/query.ts`), about their machines rather than the
 * reader's.
 */
function memberSessionsEndedSentence({ sent }: SessionsEnded) {
	const translations = get(LL);

	return sent
		? translations.organization.dashboard.sessionsEnded()
		: translations.organization.dashboard.sessionsEndedPending();
}

/**
 * what a removal says, which turns on the speed it was done at: a lock-out names how many other
 * members have to reconnect, because rotating a workspace's credentials cuts off everybody
 * holding one.
 */
function removedSentence(removed: MemberRemoved) {
	const translations = get(LL);

	return removed.lockedOut
		? translations.organization.dashboard.lockedOut({ count: removed.othersMustReconnect })
		: translations.organization.dashboard.removed();
}

export function useFetchMembers(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: keys.members,
		queryFn: () => api.organization.member.list(),
		enabled: enabled()
	}));
}

/**
 * where each account stands: whether it has a password of its own yet, and whether a machine is
 * signed in on it (effort 828, requirement 19).
 *
 * **A second query rather than a wider member row**, because the two halves come from two places:
 * the password is on the signed member row and the machine is on the register every machine writes
 * for itself. Its key sits under the members' own, so everything that invalidates the list
 * invalidates the standings with it, which is what keeps a card's line true after a link, a reset
 * or a removal.
 */
export function useFetchMemberStandings(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: keys.memberStandings,
		queryFn: () => api.organization.member.standings(),
		enabled: enabled()
	}));
}

/**
 * make an account. It hands over nothing: the account holds no password until a link is made for
 * it, so what it refreshes is what every organization write refreshes (`organizationChanged`).
 */
export const useCreateAccount = declareMutation({
	mutate: ({
		username,
		roleId,
		override,
		workspaces
	}: {
		username: string;
		roleId: string;
		override: number;
		workspaces: { id: string; access: 'full-access' | 'read-only' }[];
	}) => api.organization.member.create({ username, roleId, override, workspaces }),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	// a role's count of holders moves with an account made in it.
	invalidates: [organizationChanged],
	failed: consentLostRereadsTheState
});

/**
 * remove a member, at the speed the caller chose. The ordinary removal says so; a lock-out says
 * how many others have to reconnect, which the dialog said before it ran.
 *
 * **The sentence is chosen from what came back**, because which of the two it is is a fact about
 * what the removal did and not about what it was asked for.
 */
export const useRemoveMember = declareMutation({
	mutate: ({ memberId, lockOut }: { memberId: string; lockOut: boolean }) =>
		api.organization.member.remove({ memberId, lockOut }),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	invalidates: [organizationChanged],
	failed: consentLostRereadsTheState,
	announces: ({ result }) => removedSentence(result)
});

/**
 * rename a member. The refusals a person can act on, a username outside the rules or one already
 * taken, arrive as `BAD_REQUEST` and are shown verbatim; the list is refreshed so the row reads
 * the new username.
 */
export const useRenameMember = declareMutation({
	mutate: ({ memberId, username }: { memberId: string; username: string }) =>
		api.organization.member.rename({ memberId, username }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.renamed(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/** what locking a member out would cost, read for the dialog that asks before it is done. */
export function useLockOutCost(memberId: () => string | null) {
	return createQuery(() => ({
		queryKey: [...keys.members, 'lockOutCost', memberId()],
		queryFn: () => api.organization.member.lockOutCost({ memberId: memberId() ?? '' }),
		enabled: memberId() !== null
	}));
}

/**
 * sign a member out of every machine, from their row.
 *
 * The refusals a person can act on are the two Rust draws, their own row and the owner's, and
 * each is shown verbatim. The list is refreshed because the row's `updatedAt` moved, and for the
 * reason every other act on a row refreshes it: one place reads what a row says.
 *
 * **The sentence turns on whether the bump went out**, for the reason `useEndOtherSessions` in
 * `../session/query.ts` gives.
 */
export const useEndMemberSessions = declareMutation({
	mutate: ({ memberId }: { memberId: string }) => api.organization.member.endSessions({ memberId }),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	invalidates: [organizationChanged],
	announces: ({ result }) => memberSessionsEndedSentence(result)
});

/**
 * unlock a member who has set a password of their own (effort 851, requirement 34), so they may do
 * what their role allows. Their card's standing is under the members' key, so the badge goes with
 * the list read again.
 */
export const useUnlockMember = declareMutation({
	mutate: ({ memberId }: { memberId: string }) => api.organization.member.unlock({ memberId }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.unlocked(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/**
 * give a member a role (effort 838, requirement 5), and the override with it where one is given,
 * as one act (ticket 14). The refusals a person can act on (the member or the role ranking at or
 * above the reader, a flag the reader does not hold) arrive as the shell's refusals and read as
 * their sentences.
 */
export const useAssignRole = declareMutation({
	mutate: ({
		memberId,
		roleId,
		override
	}: {
		memberId: string;
		roleId: string;
		override?: number;
	}) => api.organization.member.assignRole({ memberId, roleId, override }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.roleChanged(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/** set the flags switched for one member alone (effort 838, requirement 6). */
export const useSetOverride = declareMutation({
	mutate: ({ memberId, override }: { memberId: string; override: number }) =>
		api.organization.member.setOverride({ memberId, override }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.overrideSaved(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/**
 * offer the organization to another account: the first of the two acts a handover is (effort 828,
 * requirement 22).
 *
 * **Nothing about the organization moves on an offer**, so the reader is still the owner and the
 * sections the settings area draws them are unchanged; what changes is that one card now carries
 * the offer, which is on the list, and the list is read again with the rest of what every
 * organization write refreshes.
 *
 * The refusal a person can act on is a password that does not open their vault, and the surface
 * marks it on the field ([[rules/interface]], *Validation errors*), so the caller reads the
 * rejection rather than only hearing it.
 */
export const useOfferOwnership = declareMutation({
	mutate: ({ memberId, password }: { memberId: string; password: string }) =>
		api.organization.member.offerOwnership({ memberId, password }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.ownershipOffered(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/** take the offer back, which leaves the organization exactly where it was. */
export const useWithdrawOffer = declareMutation({
	mutate: () => api.organization.member.withdrawOffer(),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.ownershipOfferWithdrawn(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/**
 * accept the organization that was offered to this reader (effort 828, requirement 22).
 *
 * **The state key is refreshed beside the list**, as every organization write refreshes it, and
 * here it matters most, because the reader's own role changes with the act: they are the owner the
 * moment it goes through, and the sections the settings area offers them, the acts its cards carry
 * and the rail's menus are all read off that. Without it the screen would go on drawing a member's
 * controls until a relaunch.
 *
 * The refusal a person can act on is a password that does not open their vault, and the surface
 * marks it on the field ([[rules/interface]], *Validation errors*).
 */
export const useAcceptOwnership = declareMutation({
	mutate: ({ password }: { password: string }) => api.organization.ownershipAccept({ password }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.ownershipAccepted(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [organizationChanged]
});

/**
 * make the one link that admits a machine to an account (effort 828, requirement 20).
 *
 * **A mutation rather than a query**, because it is asked for at the moment somebody presses a
 * control and its answer is shown once: cached under a key it would be a secret kept in memory for
 * as long as the section is open. The list is refreshed
 * because an invitation-kind link leaves a pending mark on the account's row.
 */
export const useMakeMemberLink = declareMutation({
	mutate: ({ memberId, lifetimeHours }: { memberId: string; lifetimeHours: number }) =>
		api.organization.member.linkMake({ memberId, lifetimeHours }),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	invalidates: [organizationChanged],
	failed: consentLostRereadsTheState,
	// a workspace the link could not carry over is said, as a reset says it: the grant is off the
	// row, and the person opening the link would otherwise find it missing with nobody told.
	announces: ({ result }) =>
		result.unreachableWorkspaces.length > 0
			? get(LL).organization.dashboard.linkUnreachableWorkspaces({
					workspaces: result.unreachableWorkspaces.map((workspace) => workspace.name).join(', ')
				})
			: undefined
});

/**
 * unset a member's password, so the next link made for them asks for a new one.
 *
 * **What it could not carry over is said rather than swallowed.** A workspace the person resetting
 * holds no full credential on is taken off the member's row, and the sentence naming those is the
 * announcement this act makes; where it carried everything over, the plain one is said.
 */
export const useUnsetMemberPassword = declareMutation({
	mutate: ({ memberId }: { memberId: string }) =>
		api.organization.member.unsetPassword({ memberId }),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	invalidates: [organizationChanged],
	failed: consentLostRereadsTheState,
	announces: ({ result }) => unsetSentence(result)
});

/** what a reset says: what it carried over, or what it could not and whom to ask. */
function unsetSentence(unreachable: { id: string; name: string }[]) {
	const ll = get(LL);

	return unreachable.length === 0
		? ll.organization.dashboard.passwordUnset()
		: ll.organization.dashboard.unreachableWorkspaces({
				workspaces: unreachable.map((workspace) => workspace.name).join(', ')
			});
}
