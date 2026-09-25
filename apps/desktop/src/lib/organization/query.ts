import { isTheGroupNeeded } from './setup';
import api, { forgetContext } from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import {
	tauri,
	type MemberRemoved,
	type OrganizationConsentResult,
	type SessionsEnded
} from '$lib/platform/tauri';
import {
	createMutation,
	createQuery,
	useQueryClient,
	type QueryClient
} from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: ['organization'],
	consent: (sessionId: string) => ['organization', 'consent', sessionId],
	members: ['organization', 'members'],
	memberStandings: ['organization', 'members', 'standings'],
	state: ['organization', 'state']
} as const;

/** how often a pending consent is asked about, while the browser tab is open somewhere else. */
const CONSENT_POLL_INTERVAL_MS = 1_500;

/**
 * The same options with an announcement put in them, for a mutation whose sentence turns on what
 * came back.
 *
 * Those options are built before the call runs, so a sentence chosen from the answer cannot be
 * declared among them; it is chosen inside `onSuccess` and handed on here. What this keeps is the
 * thing that matters: one place raises a toast, and it is `onMutationSuccess`, so the refusal path
 * is the shared one ([[rules/frontend]], *Data access*). A caller that named its own sentence
 * keeps it.
 *
 * The alternative is the one `design/mutation.ts` already took for declared mutations: a success
 * that is a function of what came back, resolved where the thunk is resolved. That widening of
 * `MutationOptions` is the right home for this, and this helper goes the day it lands; it was not
 * taken here because the three hooks that need it are this concept's, and a change to the shared
 * vocabulary belongs in a change about that vocabulary.
 */
function announcing(opts: MutationOptions, success: string): MutationOptions {
	return { ...opts, toast: { ...opts.toast, success: opts.toast?.success ?? success } };
}

/**
 * what a sign-out of the reader's other machines says.
 *
 * A bump that has not gone out means those machines are still open, so the sentence says the
 * sign-out is on its way rather than done (effort 826, requirement 22).
 */
function endedSentence({ sent }: SessionsEnded) {
	const translations = get(LL);

	return sent
		? translations.settings.you.sessions.ended()
		: translations.settings.you.sessions.endedPending();
}

/** the same, from a member's row, about their machines rather than the reader's. */
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

/**
 * open the Turso consent. What comes back is an address to send the person to and a session to
 * poll; the screen opens the address and watches the session.
 *
 * **No toast on success**, because success is a browser window opening and the screen says so
 * itself; a failure is the ordinary unexpected one.
 */
export function useBeginConsent(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	return createMutation(() => ({
		mutationFn: () => api.app.organization.consent.begin(),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * how far a consent has got, asked again every second and a half while it is still pending and
 * never once it has settled: a settled consent is a fact, and asking a fact again is a round trip
 * spent on nothing.
 */
export function useConsentResult(sessionId: () => string | null) {
	const client = useQueryClient();

	return createQuery(() => ({
		queryKey: keys.consent(sessionId() ?? ''),
		queryFn: async () => {
			const result = await api.app.organization.consent.result({ sessionId: sessionId() ?? '' });

			// a consent seen granted changes where the machine stands, and the state key is what the
			// walk reads for it: refreshed here, a person who connects, returns to the wall and comes
			// back opens the walk granted at once rather than after that query's own refetch. The
			// poll stops on the same answer, so this runs once per grant.
			if (result.status === 'granted') {
				await client.invalidateQueries({ queryKey: keys.state });
			}

			return result;
		},
		enabled: sessionId() !== null,
		refetchInterval: (query) => {
			const result = query.state.data as OrganizationConsentResult | undefined;

			return !result || result.status === 'pending' ? CONSENT_POLL_INTERVAL_MS : false;
		}
	}));
}

/**
 * after an owner repeats the consent on a new machine: record which account it is over, and
 * refresh where the machine stands, which now says it holds the authority.
 */
export function useReconnectAuthority(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.authorityReconnected(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => tauri.organization.reconnectAuthority(),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * forget the Turso authority this machine holds, and refresh where the machine stands, which
 * the first run reads to open its connect step as granted: a walk that read the authority as
 * held would otherwise go on reading it that way after it was given back.
 */
export function useDisconnect(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.accountForgotten(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.app.organization.consent.disconnect(),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * forget the organization this machine holds: the shell signs out where somebody is in, deletes
 * every replica here, empties the record and clears the Turso authority (requirement 20 of
 * effort 824). Nothing on Turso is touched.
 *
 * **No invalidation here**, because what follows is the wall: the caller hands the outcome to
 * the startup unit, which reads where the machine stands and raises the screen a machine with
 * nothing shows, clearing the whole cache on the way. The one confirm before it runs is the
 * screen's.
 */
export function useDisconnectOrganization(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.disconnected(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	return createMutation(() => ({
		mutationFn: () => api.app.organization.disconnect(),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * delete the organization: the shell removes every workspace database and the organization's own
 * directory from the owner's Turso account, then forgets all of it here (effort 828, requirement
 * 18). Nothing puts either back.
 *
 * **No invalidation here**, for the same reason the disconnect has none: what follows is the first
 * screen, and the caller hands the outcome to the startup unit, which reads where the machine
 * stands and clears the whole cache on the way. The one question before it runs is the surface's,
 * and it is where the password is typed.
 */
export function useDeleteOrganization(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.organizationDeleted(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	return createMutation(() => ({
		mutationFn: (input: { password: string }) => api.app.organization.delete(input),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * create the organization, from the name, the username and the password the walk's name step
 * collects, and the Turso group where the step was asked to collect one. The refusals a person
 * can act on arrive as `BAD_REQUEST` and are shown verbatim; everything else reads as an
 * unexpected failure, which is the shared handler's rule. A Turso that would take no group the
 * application could work out, and a group that is not the one the consent is over, are both of
 * the first kind, and the walk acts on each where it is caught.
 */
export function useCreateOrganization(
	opts: MutationOptions = {
		toast: {
			// the one refusal the walk says in place, beside the field it adds, is kept out of
			// the toast; every other refusal is raised in its own words as before.
			error: (error) => (isTheGroupNeeded(error) ? null : true),
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	return createMutation(() => ({
		mutationFn: ({
			name,
			username,
			password,
			group
		}: {
			name: string;
			username: string;
			password: string;
			group: string | null;
		}) =>
			// the router's input takes the group as optional rather than nullable, so a walk that
			// was asked for none leaves the key out altogether.
			api.app.organization.create({ name, username, password, group: group ?? undefined }),
		// creating the organization signs its owner in, and the held context was built while
		// nobody was: the walk's next call, the first workspace, needs an actor, so the context
		// is forgotten here the way the wall and a sign-out forget it (`api/caller`).
		onSuccess: () => {
			forgetContext();
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * what the consented Turso account already holds, asked once after the consent (effort 828,
 * requirement 14). It reads and changes nothing, and the walk goes to the name step or to the
 * sign-in step on what it answers. A refusal is the shared handler's: the person is on the
 * consent step and the button is still there.
 */
export function useInspectGroup(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	return createMutation(() => ({
		mutationFn: () => api.app.organization.groupInspect(),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * connect this machine to the organization the account already holds, with the owner's username
 * and password. Every refusal is said on the step rather than in a toast, the way the create's
 * group refusal is: the sentence belongs beside the fields that were typed into, and the walk is
 * what decides whether to keep the step or go back to the consent.
 */
export function useConnectExisting(
	opts: MutationOptions = {
		toast: { error: () => null, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ username, password }: { username: string; password: string }) =>
			api.app.organization.connectExisting({ username, password }),
		// the connect signs the owner in, and the held context was built while nobody was: it is
		// forgotten here the way a create forgets it, so the next call has an actor.
		onSuccess: async () => {
			forgetContext();
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

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
export function useCreateWorkspace(
	queryClient?: QueryClient,
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).layout.noWorkspace.created(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	// the client the caller handed in, or the one in context: either way it is the one whose
	// state key the rail's switcher, the page's list and the invite's checkboxes read.
	const client = queryClient ?? useQueryClient();

	return createMutation(
		() => ({
			mutationFn: ({ name }: { name: string }) => api.app.organization.workspace.create({ name }),
			onSuccess: async () => {
				await client.invalidateQueries({ queryKey: keys.state });
				onMutationSuccess(opts);
			},
			onError: (e) => onMutationError(opts, e)
		}),
		() => client
	);
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
export function useDeleteWorkspace(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.workspaceDeleted(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ workspaceId }: { workspaceId: string }) =>
			api.app.organization.workspace.remove({ workspaceId }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useFetchMembers(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: keys.members,
		queryFn: () => api.app.organization.member.list(),
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
		queryFn: () => api.app.organization.member.standings(),
		enabled: enabled()
	}));
}

/** where this machine stands: the organizations it joined and who is in. */
export function useFetchOrganizationState() {
	return createQuery(() => ({
		queryKey: keys.state,
		queryFn: () => tauri.organization.getState()
	}));
}

/**
 * make an account. It hands over nothing: the account holds no password until a link is made for
 * it, so this only refreshes the list it changed.
 */
export function useCreateAccount(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({
			username,
			role,
			permissions,
			workspaces
		}: {
			username: string;
			role: 'administrator' | 'member';
			permissions: number;
			workspaces: { id: string; access: 'full-access' | 'read-only' }[];
		}) => api.app.organization.member.create({ username, role, permissions, workspaces }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * remove a member, at the speed the caller chose. The ordinary removal says so; a lock-out says
 * how many others have to reconnect, which the dialog said before it ran.
 *
 * **The sentence is chosen from what came back**, because which of the two it is is a fact about
 * what the removal did and not about what it was asked for.
 */
export function useRemoveMember(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId, lockOut }: { memberId: string; lockOut: boolean }) =>
			api.app.organization.member.remove({ memberId, lockOut }),
		onSuccess: async (result) => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(announcing(opts, removedSentence(result)));
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * rename a member. The refusals a person can act on, a username outside the rules or one already
 * taken, arrive as `BAD_REQUEST` and are shown verbatim; the list is refreshed so the row reads
 * the new username.
 */
export function useRenameMember(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.renamed(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId, username }: { memberId: string; username: string }) =>
			api.app.organization.member.rename({ memberId, username }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/** what locking a member out would cost, read for the dialog that asks before it is done. */
export function useLockOutCost(memberId: () => string | null) {
	return createQuery(() => ({
		queryKey: [...keys.members, 'lockOutCost', memberId()],
		queryFn: () => api.app.organization.member.lockOutCost({ memberId: memberId() ?? '' }),
		enabled: memberId() !== null
	}));
}

/**
 * the signed-in member's own password, changed from the account page. The refusal a person
 * can act on, a password under the floor or a current one that did not open, is shown.
 */
export function useChangePassword(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settings.you.password.changed(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	return createMutation(() => ({
		mutationFn: ({ current, next }: { current: string; next: string }) =>
			api.app.organization.password.change({ current, next }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * end the reader's own sessions on every other machine, from the account section (effort 826,
 * requirement 22).
 *
 * **This machine stays signed in**, so there is nothing to invalidate but where the machine
 * stands: the session the screen is drawn from is the same one, under a number that moved. The
 * toast is what tells the person it happened, because nothing on screen changes.
 *
 * **And it tells them which of two things happened.** The bump is written on this machine's
 * replica and pushed; a machine with no connection cannot push, and the other machines stay open
 * until one of its heartbeats can. Saying *they were signed out* then would be false about the
 * one thing this act is for, so the sentence says the sign-out is pending instead.
 */
export function useEndOtherSessions(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.app.organization.session.endElsewhere(),
		onSuccess: async (result) => {
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(announcing(opts, endedSentence(result)));
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * sign a member out of every machine, from their row.
 *
 * The refusals a person can act on are the two Rust draws, their own row and the owner's, and
 * each is shown verbatim. The list is refreshed because the row's `updatedAt` moved, and for the
 * reason every other act on a row refreshes it: one place reads what a row says.
 *
 * **The sentence turns on whether the bump went out**, for the reason {@link useEndOtherSessions}
 * gives.
 */
export function useEndMemberSessions(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId }: { memberId: string }) =>
			api.app.organization.member.endSessions({ memberId }),
		onSuccess: async (result) => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(announcing(opts, memberSessionsEndedSentence(result)));
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * Turso's own sentence about a standing account refusal: the owner's alone, `null` for
 * everybody else, and read only while a refusal stands.
 */
export function useAccountRefusalDetail(refused: () => boolean) {
	return createQuery(() => ({
		queryKey: [...keys.state, 'accountRefusal'],
		queryFn: () => tauri.organization.accountRefusalDetail(),
		enabled: refused()
	}));
}

/**
 * write a member's role and the acts their row carries, together.
 *
 * The refusals a person can act on are the owner's two sentences, their own row and the owner's,
 * and each arrives as `BAD_REQUEST` or a forbidden and is shown verbatim; the list is refreshed
 * so the row reads the new role and the chips read the same grants.
 */
export function useChangeRole(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.roleChanged(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({
			memberId,
			role,
			permissions
		}: {
			memberId: string;
			role: 'administrator' | 'member';
			permissions: number;
		}) => api.app.organization.member.changeRole({ memberId, role, permissions }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * offer the organization to another account: the first of the two acts a handover is (effort 828,
 * requirement 22).
 *
 * **Only the list is refreshed.** Nothing about the organization moves on an offer, so the
 * reader is still the owner and the sections the settings area draws them are unchanged; what
 * changes is that one card now carries the offer, which is on the list.
 *
 * The refusal a person can act on is a password that does not open their vault, and the surface
 * marks it on the field ([[rules/interface]], *Validation errors*), so the caller reads the
 * rejection rather than only hearing it.
 */
export function useOfferOwnership(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.ownershipOffered(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId, password }: { memberId: string; password: string }) =>
			api.app.organization.member.offerOwnership({ memberId, password }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/** take the offer back, which leaves the organization exactly where it was. */
export function useWithdrawOffer(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.ownershipOfferWithdrawn(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.app.organization.member.withdrawOffer(),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * accept the organization that was offered to this reader (effort 828, requirement 22).
 *
 * **The state key is refreshed beside the list**, because the reader's own role changes with the
 * act: they are the owner the moment it goes through, and the sections the settings area offers
 * them, the acts its cards carry and the rail's menus are all read off that. Without it the
 * screen would go on drawing a member's controls until a relaunch.
 *
 * The refusal a person can act on is a password that does not open their vault, and the surface
 * marks it on the field ([[rules/interface]], *Validation errors*).
 */
export function useAcceptOwnership(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.ownershipAccepted(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ password }: { password: string }) =>
			api.app.organization.ownershipAccept({ password }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

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
export function useChangeAccess(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.accessSaved(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: async ({ changes }: { changes: AccessChange[] }) => {
			for (const change of changes) {
				if (change.access === 'none') {
					await api.app.organization.workspace.withdraw({
						workspaceId: change.workspaceId,
						memberId: change.memberId
					});
				} else {
					await api.app.organization.workspace.grant({
						workspaceId: change.workspaceId,
						memberId: change.memberId,
						access: change.access
					});
				}
			}
		},
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e),
		// on a refusal part way as much as on success: the writes before the refusal stand, and a
		// list left as it was would show the reader an access the row no longer has.
		onSettled: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			await client.invalidateQueries({ queryKey: keys.state });
		}
	}));
}

/**
 * make the one link that admits a machine to an account (effort 828, requirement 20).
 *
 * **A mutation rather than a query**, because it is asked for at the moment somebody presses a
 * control and its answer is shown once: cached under a key it would be a secret kept in memory for
 * as long as the section is open. The list is refreshed
 * because an invitation-kind link leaves a pending mark on the account's row.
 */
export function useMakeMemberLink(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId }: { memberId: string }) =>
			api.app.organization.member.linkMake({ memberId }),
		onSuccess: async (made) => {
			await client.invalidateQueries({ queryKey: keys.members });

			// a workspace the link could not carry over is said, as a reset says it: the grant is
			// off the row, and the person opening the link would otherwise find it missing with
			// nobody told.
			if (made.unreachableWorkspaces.length > 0) {
				onMutationSuccess(
					announcing(
						opts,
						get(LL).organization.dashboard.linkUnreachableWorkspaces({
							workspaces: made.unreachableWorkspaces.map((workspace) => workspace.name).join(', ')
						})
					)
				);

				return;
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * unset a member's password, so the next link made for them asks for a new one.
 *
 * **What it could not carry over is said rather than swallowed.** A workspace the person resetting
 * holds no full credential on is taken off the member's row, and the sentence naming those is the
 * announcement this act makes; where it carried everything over, the plain one is said.
 */
export function useUnsetMemberPassword(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId }: { memberId: string }) =>
			api.app.organization.member.unsetPassword({ memberId }),
		onSuccess: async (unreachable) => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(announcing(opts, unsetSentence(unreachable)));
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/** what a reset says: what it carried over, or what it could not and whom to ask. */
function unsetSentence(unreachable: { id: string; name: string }[]) {
	const ll = get(LL);

	return unreachable.length === 0
		? ll.organization.dashboard.passwordUnset()
		: ll.organization.dashboard.unreachableWorkspaces({
				workspaces: unreachable.map((workspace) => workspace.name).join(', ')
			});
}
