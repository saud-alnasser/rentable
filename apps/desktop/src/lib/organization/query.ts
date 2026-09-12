import api from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import { tauri, type OrganizationConsentResult } from '$lib/platform/tauri';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: ['organization'],
	consent: (sessionId: string) => ['organization', 'consent', sessionId],
	members: ['organization', 'members'],
	invitations: ['organization', 'invitations'],
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
	return createQuery(() => ({
		queryKey: keys.consent(sessionId() ?? ''),
		queryFn: () => api.app.organization.consent.result({ sessionId: sessionId() ?? '' }),
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

/** forget the Turso authority this machine holds. */
export function useDisconnect(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).organization.disconnected(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	return createMutation(() => ({
		mutationFn: () => api.app.organization.consent.disconnect(),
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
		mutationFn: ({ name, password }: { name: string; password: string }) =>
			api.app.organization.create({ name, password }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

/**
 * create the first workspace, or another. The refusal a person can act on, an owner elsewhere,
 * arrives as `BAD_REQUEST` or a forbidden and is shown; everything else reads as unexpected.
 */
export function useCreateWorkspace(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).layout.noWorkspace.created(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	return createMutation(() => ({
		mutationFn: ({ name }: { name: string }) => api.app.organization.workspace.create({ name }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useFetchMembers() {
	return createQuery(() => ({
		queryKey: keys.members,
		queryFn: () => api.app.organization.member.list()
	}));
}

export function useFetchInvitations() {
	return createQuery(() => ({
		queryKey: keys.invitations,
		queryFn: () => api.app.organization.invitation.list()
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
			email,
			displayName,
			role,
			workspaceIds
		}: {
			email: string;
			displayName: string;
			role: 'administrator' | 'member';
			workspaceIds: string[];
		}) => api.app.organization.member.invite({ email, displayName, role, workspaceIds }),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: keys.members }),
				client.invalidateQueries({ queryKey: keys.invitations })
			]);
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
			await Promise.all([
				client.invalidateQueries({ queryKey: keys.members }),
				client.invalidateQueries({ queryKey: keys.invitations })
			]);
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
			await client.invalidateQueries({ queryKey: keys.invitations });
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

/** reset a member's password: a reissue from what the resetting administrator holds. */
export function useReissueInvitation(
	opts: MutationOptions = {
		toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ memberId }: { memberId: string }) =>
			api.app.organization.invitation.reissue({ memberId }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: keys.invitations });
			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
