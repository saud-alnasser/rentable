import api from '$lib/api/caller';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import type { OrganizationConsentResult } from '$lib/platform/tauri';
import { createMutation, createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: ['organization'],
	consent: (sessionId: string) => ['organization', 'consent', sessionId]
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
