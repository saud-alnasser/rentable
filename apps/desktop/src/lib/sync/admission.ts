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
 * **There were three kinds until effort 826, requirement 12.** The third was a member in on a
 * password somebody else drew, who had to choose their own before reaching anything. No password
 * is handed over any more: an invitation carries its secret inside the link and the person chooses
 * a password to open it with, so there is no session that is admitted and held back at once.
 *
 * **There is nothing to be admitted to without an organization.** Its refusal is the whole window:
 * no surface renders workspace data behind it and no write reaches any database, because the
 * application has not started.
 *
 * **A third reason arrived with effort 826, requirement 22**, and it is `locked` with something to
 * say: the machine holds an organization, no vault is open, and the reason none is open is that
 * somebody ended this member's sessions from another machine. The way past it is the password, as
 * for `locked`; the difference is the sentence, and a person who was not the one who signed
 * themselves out is owed it.
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
			 * first and every sign-out: the screen names the organization and asks for a username
			 * and a password. `signedOutElsewhere` is that same screen with one sentence more,
			 * for a machine whose session somebody ended from another one (effort 826,
			 * requirement 22): the way past it is the same password, and what the sentence saves
			 * the person is wondering why they were signed out.
			 */
			reason: 'noOrganization' | 'locked' | 'signedOutElsewhere';
	  }
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
		return { kind: 'admitted', session: state.session };
	}

	if (state.organization === null) {
		return { kind: 'signInRequired', reason: 'noOrganization' };
	}

	return {
		kind: 'signInRequired',
		reason: state.signedOutElsewhere ? 'signedOutElsewhere' : 'locked'
	};
}
