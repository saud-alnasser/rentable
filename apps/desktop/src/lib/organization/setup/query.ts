import api, { forgetContext } from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { tauri } from '$lib/organization/tauri';
import type { OrganizationConsentResult } from '$lib/organization/host';
import { keys } from '$lib/organization/query';
import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

import { isTheGroupNeeded } from './setup';

/**
 * THE WAY IN'S QUERIES
 *
 * The Turso consent, the authority it leaves on this machine, and the first run that creates an
 * organization or connects to the one the account already holds.
 */

/** how often a pending consent is asked about, while the browser tab is open somewhere else. */
const CONSENT_POLL_INTERVAL_MS = 1_500;

/**
 * open the Turso consent. What comes back is an address to send the person to and a session to
 * poll; the screen opens the address and watches the session.
 *
 * **No toast on success**, because success is a browser window opening and the screen says so
 * itself; a failure is the ordinary unexpected one.
 */
export const useBeginConsent = declareMutation({
	mutate: () => api.organization.consent.begin(),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
});

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
			const result = await api.organization.consent.result({ sessionId: sessionId() ?? '' });

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
export const useReconnectAuthority = declareMutation({
	mutate: () => tauri.reconnectAuthority(),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.authorityReconnected(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [keys.state]
});

/**
 * forget the Turso authority this machine holds, and refresh where the machine stands, which
 * the first run reads to open its connect step as granted: a walk that read the authority as
 * held would otherwise go on reading it that way after it was given back.
 */
export const useDisconnect = declareMutation({
	mutate: () => api.organization.consent.disconnect(),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.accountForgotten(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	invalidates: [keys.state]
});

/**
 * create the organization, from the name, the username and the password the walk's name step
 * collects, and the Turso group where the step was asked to collect one. The refusals a person
 * can act on arrive as `BAD_REQUEST` and are shown verbatim; everything else reads as an
 * unexpected failure, which is the shared handler's rule. A Turso that would take no group the
 * application could work out, and a group that is not the one the consent is over, are both of
 * the first kind, and the walk acts on each where it is caught.
 */
export const useCreateOrganization = declareMutation({
	mutate: ({
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
		api.organization.create({ name, username, password, group: group ?? undefined }),
	touches: 'none',
	toast: {
		// the one refusal the walk says in place, beside the field it adds, is kept out of
		// the toast; every other refusal is raised in its own words as before.
		error: (error) => (isTheGroupNeeded(error) ? null : true),
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	// creating the organization signs its owner in, and the held context was built while
	// nobody was: the walk's next call, the first workspace, needs an actor, so the context
	// is forgotten here the way the wall and a sign-out forget it (`api/caller`).
	landed: () => {
		forgetContext();
	}
});

/**
 * what the consented Turso account already holds, asked once after the consent (effort 828,
 * requirement 14). It reads and changes nothing, and the walk goes to the name step or to the
 * sign-in step on what it answers. A refusal is the shared handler's: the person is on the
 * consent step and the button is still there.
 */
export const useInspectGroup = declareMutation({
	mutate: () => api.organization.groupInspect(),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() }
});

/**
 * connect this machine to the organization the account already holds, with the owner's username
 * and password. Every refusal is said on the step rather than in a toast, the way the create's
 * group refusal is: the sentence belongs beside the fields that were typed into, and the walk is
 * what decides whether to keep the step or go back to the consent.
 */
export const useConnectExisting = declareMutation({
	mutate: ({ username, password }: { username: string; password: string }) =>
		api.organization.connectExisting({ username, password }),
	touches: 'none',
	toast: { error: () => null, unexpected: () => get(LL).common.messages.unexpectedError() },
	// the connect signs the owner in, and the held context was built while nobody was: it is
	// forgotten here the way a create forgets it, so the next call has an actor.
	landed: () => {
		forgetContext();
	},
	invalidates: [keys.state]
});
