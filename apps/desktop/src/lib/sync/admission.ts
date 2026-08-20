import type { RemoteSyncAccount, RemoteSyncState } from '$lib/platform/host';

import { workspaceReplicationStanding } from './session';
import { signedInAccount } from './account';

/**
 * ADMISSION
 *
 * whether this machine may use the application at all, and what stands in the way where it may
 * not.
 *
 * **A different question from `./session`, and one layer in front of it.** That file answers *may
 * this workspace still replicate* — a question about a credential, whose answer stops data
 * crossing the network and touches nothing a user sees. This one answers *may this person in*,
 * and its refusal is the whole window: no surface renders workspace data behind it and no write
 * reaches the database, because the application has not started.
 *
 * **There is nothing to be admitted to without an account.** Requirement 3 makes signing up the
 * act that brings the workspace into being, so an install that has never signed in holds no
 * workspace to show rather than an empty one — which is why this is a wall rather than a prompt
 * that can be dismissed, and why the screen behind it renders nothing at all.
 *
 * **The session's window is the second gate and not the first.** Requirement 15 closes the
 * refresh window after three days offline, and past it the application locks behind the same
 * screen until a network returns — at which point the held token refreshes with nobody typing
 * anything. That is a lock rather than a sign-out, so the two refusals are told apart here even
 * though the screen they reach is one: what the user has to do about each is different.
 */

/**
 * where this machine stands with the sign-in wall.
 *
 * `starting` is the shell not having reported yet, and it is deliberately neither of the other
 * two: a state still loading is not an install that failed to sign in, and answering it with a
 * demand would put the login page in front of every launch for as long as the first read takes.
 */
export type Admission =
	| { kind: 'starting' }
	| {
			kind: 'signInRequired';
			/**
			 * why, because the two are not the same thing to the person reading the screen.
			 *
			 * `noAccount` is an install nobody has signed in on — the whole application is on the far
			 * side of a Google account it does not have. `windowClosed` is a signed-in machine that
			 * has been out of contact past its window: the same screen, but the workspace is still
			 * there and reconnecting is what opens it, rather than signing up for anything.
			 *
			 * `noSession` is the third, and it is the one that was being read as one of the other
			 * two. This machine answered a consent screen and holds an identity; what it never got
			 * is a session, because establishing one runs after the sign-in and is allowed to fail.
			 * It is not somebody who has never signed in, and it is not somebody who went offline
			 * for three days, so it is offered a retry rather than either of those sentences.
			 */
			reason: 'noAccount' | 'windowClosed' | 'noSession';
	  }
	| { kind: 'admitted'; account: RemoteSyncAccount };

/**
 * Where this machine stands with the sign-in wall, given the state the shell reported and the time.
 *
 * The clock is an argument for the reason `replicationStanding`'s is: requirement 15 is three days
 * passing, and a test has to reach the far side of a window without moving the machine's clock.
 *
 * **The window is consulted only where there is a control plane to have heard from.** A build that
 * was never told where one is can never hold a session, so reading its absence as a closed window
 * would lock every such build out of itself the moment somebody signed in — the same trap
 * `hostedOutcome` guards in `./workspace`, and the same capability flag answers it. The build
 * either has somewhere to sign in to or it does not, and that is a fact about the build rather
 * than about the person.
 */
export function workspaceAdmission(
	state: RemoteSyncState | null | undefined,
	now: number = Date.now()
): Admission {
	if (!state) {
		return { kind: 'starting' };
	}

	const account = signedInAccount(state);

	if (!account) {
		return { kind: 'signInRequired', reason: 'noAccount' };
	}

	if (
		state.controlPlaneReady &&
		workspaceReplicationStanding(state, now).kind === 'signInRequired'
	) {
		// **The window is what tells the two apart, and its absence is not its expiry.** A machine
		// that holds one has had a session and let it run down; a machine that holds none never got
		// one, which after a successful sign-in means the control plane was not reached.
		// `replicationStanding` deliberately does not distinguish them, because what it answers is
		// whether replication may continue and the answer is no either way. This is the layer that
		// has to, because what the person is told and what they can do about it differ.
		return {
			kind: 'signInRequired',
			reason: state.session ? 'windowClosed' : 'noSession'
		};
	}

	return { kind: 'admitted', account };
}
