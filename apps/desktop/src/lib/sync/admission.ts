import type { OrganizationSession, OrganizationState } from '$lib/platform/host';

/**
 * ADMISSION
 *
 * whether this machine may use the application at all, and what stands in the way where it may
 * not.
 *
 * **It used to answer in terms of an account and a session window.** Three reasons stood here:
 * no Google account, a session window closed after three days out of contact, and an identity
 * with no session because a control plane could not be reached. All three were facts about a
 * service, and requirement 18 of the organization effort removes the service: signing in works
 * with the network down, because what admits a person is a password opening a vault on this
 * machine, and nothing about that has a window.
 *
 * **So the question is asked of the organization state, and the two refusals are the
 * organization's own.** A machine that holds no organization has nothing to sign in to, and the
 * way past that is the first run or the organization's link. A machine that holds one and no
 * open vault is locked, and the way past that is a password. Neither is a lock a returning network
 * lifts, because neither was put up by a network going away.
 *
 * **There is nothing to be admitted to without an organization.** Its refusal is the whole window:
 * no surface renders workspace data behind it and no write reaches any database, because the
 * application has not started.
 */

/**
 * where this machine stands with the sign-in wall.
 *
 * `starting` is the shell not having reported yet, and it is deliberately neither of the other
 * two: a state still loading is not a machine with no organization, and answering it with a demand
 * would put the sign-in card in front of every launch for as long as the first read takes.
 */
export type Admission =
	| { kind: 'starting' }
	| {
			kind: 'signInRequired';
			/**
			 * why, because the two are not the same thing to the person reading the screen.
			 *
			 * `noOrganization` is a machine that holds nothing: there is no vault to open and no
			 * password to type, and the screen offers the two ways to connect instead. `locked` is a
			 * machine that holds an organization and no open vault, which is every launch after the
			 * first and every sign-out: the screen names the organization and asks for a password.
			 */
			reason: 'noOrganization' | 'locked';
	  }
	/**
	 * a vault is open, and the password that opened it is one somebody else drew: the member has
	 * to choose their own before they reach anything else, which the shell refuses regardless.
	 */
	| { kind: 'passwordChangeRequired'; session: OrganizationSession }
	| { kind: 'admitted'; session: OrganizationSession };

/**
 * Where this machine stands with the sign-in wall, given the organization state the shell reported.
 *
 * **No clock.** The window that used to be consulted here is gone with the service that issued
 * it; a vault is open or it is not, and time does not move that.
 */
export function organizationAdmission(state: OrganizationState | null | undefined): Admission {
	if (!state) {
		return { kind: 'starting' };
	}

	if (state.session) {
		return state.session.mustChangePassword
			? { kind: 'passwordChangeRequired', session: state.session }
			: { kind: 'admitted', session: state.session };
	}

	return {
		kind: 'signInRequired',
		reason: state.organization === null ? 'noOrganization' : 'locked'
	};
}
