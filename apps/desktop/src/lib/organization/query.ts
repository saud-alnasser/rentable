import api, { forgetContext } from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import { tauri, type OrganizationConsentResult } from '$lib/platform/tauri';
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
	state: ['organization', 'state'],
	ownLink: ['organization', 'own-link']
} as const;

/** how often a pending consent is asked about, while the browser tab is open somewhere else. */
const CONSENT_POLL_INTERVAL_MS = 1_500;

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
			success: () => get(LL).organization.disconnected(),
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
 * create the organization. The refusals a person can act on arrive as `BAD_REQUEST` and are
 * shown verbatim; everything else reads as an unexpected failure, which is the shared handler's
 * rule.
 */
export function useCreateOrganization(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	return createMutation(() => ({
		mutationFn: ({
			name,
			username,
			password
		}: {
			name: string;
			username: string;
			password: string;
		}) => api.app.organization.create({ name, username, password }),
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

export function useFetchMembers() {
	return createQuery(() => ({
		queryKey: keys.members,
		queryFn: () => api.app.organization.member.list()
	}));
}

/**
 * the organization's own link, for the owner to share or keep. Fetched on demand where the owner's
 * dashboard draws it; the credential it carries is the owner's own and already in their vault.
 */
export function useOrganizationLink(enabled: () => boolean) {
	return createQuery(() => ({
		queryKey: keys.ownLink,
		queryFn: () => tauri.organization.ownLink(),
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
 * invite a member. What comes back is shown once by the surface that asked; this hook only
 * refreshes the two lists it changed.
 */
export function useInviteMember(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({
			username,
			role,
			workspaces
		}: {
			username: string;
			role: 'administrator' | 'member';
			workspaces: { id: string; access: 'full-access' | 'read-only' }[];
		}) => api.app.organization.member.invite({ username, role, workspaces }),
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
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
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

export function useRevokeInvitation(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.revoked(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ invitationId }: { invitationId: string }) =>
			api.app.organization.invitation.revoke({ invitationId }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * the signed-in member's own password, changed from the account page. The refusal a person
 * can act on, a password under the floor or a current one that did not open, is shown.
 */
export function useChangePassword(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).account.password.changed(),
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
 * end the reader's own sessions on every other machine, from the you section (effort 826,
 * requirement 22).
 *
 * **This machine stays signed in**, so there is nothing to invalidate but where the machine
 * stands: the session the screen is drawn from is the same one, under a number that moved. The
 * toast is what tells the person it happened, because nothing on screen changes.
 */
export function useEndOtherSessions(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).account.sessions.ended(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => api.app.organization.session.endElsewhere(),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.state });
			onMutationSuccess(opts);
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
 */
export function useEndMemberSessions(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.dashboard.sessionsEnded(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId }: { memberId: string }) =>
			api.app.organization.member.endSessions({ memberId }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
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
 * grant a member a workspace, at full access or read only.
 *
 * **No toast of its own**, because a change of access is several of these and a withdrawal
 * beside them: the caller says once that the workspaces were saved. Minting a read-only
 * credential is the owner's and is refused by name elsewhere, which the shared handler shows.
 */
export function useGrantWorkspace(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({
			workspaceId,
			memberId,
			access
		}: {
			workspaceId: string;
			memberId: string;
			access: 'full-access' | 'read-only';
		}) => api.app.organization.workspace.grant({ workspaceId, memberId, access }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * take a workspace back from a member. Nothing is minted and nothing rotates, so the credential
 * they already hold works until it expires; cutting somebody off at once is the lock-out on a
 * removal. Quiet for the same reason the grant is.
 */
export function useWithdrawGrant(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ workspaceId, memberId }: { workspaceId: string; memberId: string }) =>
			api.app.organization.workspace.withdraw({ workspaceId, memberId }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * the invitation link again, for the person who issued it. Nobody else can read it, and the row
 * offers them a new link instead; the refusal arrives as a forbidden and is shown.
 *
 * **A mutation rather than a query**, because it is asked for at the moment somebody presses a
 * control and its answer is shown once: cached under a key, it would be a secret kept in memory
 * for as long as the section is open.
 */
export function useInvitationLink(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	return createMutation(() => ({
		mutationFn: ({ invitationId }: { invitationId: string }) =>
			api.app.organization.invitation.link({ invitationId }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * a fresh confirmation code for an invitation, for the person who issued it. The one before it
 * opens nothing from then on, and anybody else is refused and offered a new link.
 *
 * **A mutation rather than a query**, and quiet, for the reasons `useInvitationLink` gives: it is
 * asked for at the moment somebody presses a control, its answer is a secret shown once, and the
 * panel it lands in is where the reader learns it worked.
 */
export function useInvitationCode(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	return createMutation(() => ({
		mutationFn: ({ invitationId }: { invitationId: string }) =>
			api.app.organization.invitation.code({ invitationId }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/** reset a member's password: a fresh link, from what the resetting administrator holds. */
export function useReissueInvitation(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId }: { memberId: string }) =>
			api.app.organization.member.reset({ memberId }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.members });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
