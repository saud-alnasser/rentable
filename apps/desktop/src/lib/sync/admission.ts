import type { RemoteSyncAccount, RemoteSyncState } from '$lib/platform/host';

import { workspaceReplicationStanding } from './session';
import { signedInAccount } from './sign-in';

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
			 */
			reason: 'noAccount' | 'windowClosed';
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
		return { kind: 'signInRequired', reason: 'windowClosed' };
	}

	return { kind: 'admitted', account };
}
