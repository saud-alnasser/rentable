import type { RemoteSyncProvider, RemoteSyncState, SessionWindow } from '$lib/platform/host';

/**
 * THE SESSION
 *
 * how long this machine may go on replicating without hearing from the control plane, and what
 * it asks for when it may not.
 *
 * **The window is a lifetime issued elsewhere, never a flag set here.** What this reads is a
 * number the control plane sent, carried on the state the shell reports, and the only thing done
 * with it is a comparison against a clock. Nothing here can extend it: the thing a replica
 * actually needs is a credential minted over there, and the control plane declines to mint one
 * for a session it will not renew. Writing a later number would buy a client that keeps trying
 * and keeps being refused, which is why the requirement is a TTL rather than a promise the client
 * makes about itself.
 *
 * **It is read off the state rather than held here, and that is the whole of how it survives a
 * restart.** Module state would start again at every launch, so a client that signed in on Monday
 * and reopened the application on Tuesday with no network would be asked to sign in — while the
 * control plane would still have renewed it for another day. Requirement 15 is three days, not
 * three days of one sitting. Rust persists the window beside the workspace
 * (`tauri/src/sync/control.rs`) and the token stays in the credential store, which is why what
 * arrives here is two numbers and no credential.
 *
 * **Two moments, and the earlier governs.** `expiresAt` is how much longer the control plane will
 * renew this sign-in; `replicaExpiresAt` is how much longer the credential the replica syncs with
 * lives. They are started by different calls — a refresh moves the first alone, a mint restarts
 * both — so equal lengths never made them one clock. A client reading only the session's would go
 * on believing it may replicate after the credential that carries replication had died.
 *
 * **Expiry stops replication and nothing else.** Past the window the workspace is still open,
 * still readable and still writable — it is a database on this machine — and what is refused is
 * sending it anywhere. Nothing here discards a write to produce that refusal, and nothing here
 * touches the database at all.
 *
 * **A local workspace never enters this path.** It has no session because it never signed in, and
 * `provider` is what decides that — not whether somebody happens to be signed in to Google, which
 * they may well be with a purely local workspace. The rule below branches on the mode first, so a
 * local workspace's answer never depends on a session at all.
 */

export type { SessionWindow };

/**
 * whether this workspace may replicate, and what to do where it may not.
 *
 * `unsessioned` is the ordinary answer and not a degraded one: a local workspace has no session
 * to expire, and a workspace kept on Drive is not replicating through the control plane either.
 * Neither is ever asked for anything on this path.
 */
export type ReplicationStanding =
	| { kind: 'unsessioned' }
	| { kind: 'live'; until: number }
	| {
			kind: 'signInRequired';
			/**
			 * the action to take, named rather than described.
			 *
			 * A code, because the sentence is the surface's and has to be written in the user's
			 * language — Arabic and English are both first-class here, so a layer emitting English
			 * prose would hand half the users an untranslated string. It reaches the user as
			 * `settingsSync.sessionExpired`, rendered by the layout that shows sync results.
			 */
			action: 'signInWithGoogle';
	  };

/**
 * the last moment this machine may still replicate, given everything it holds.
 *
 * The earlier of the two, and `replicaExpiresAt` being absent means *nothing has been minted
 * yet* rather than *no limit* — which is the state a workspace is in between signing in and its
 * first mint, and it does not constrain a window that has not started.
 */
function windowClosesAt(session: SessionWindow): number {
	return session.replicaExpiresAt === null
		? session.expiresAt
		: Math.min(session.expiresAt, session.replicaExpiresAt);
}

/**
 * Where a workspace stands, given the mode it is in, the window held for it, and the time.
 *
 * Pure, and the clock is an argument: requirement 15 is three days passing, so a test has to be
 * able to move past the window without moving the machine's clock.
 */
export function replicationStanding({
	provider,
	session,
	now
}: {
	provider: RemoteSyncProvider | null | undefined;
	session: SessionWindow | null;
	now: number;
}): ReplicationStanding {
	// the mode first, and nothing about the session is consulted for the modes that have none.
	if (provider !== 'hosted') {
		return { kind: 'unsessioned' };
	}

	if (session) {
		const until = windowClosesAt(session);

		// Strict, so the moment the control plane named is the first one outside the window
		// rather than the last one inside it — the same boundary that side takes.
		if (now < until) {
			return { kind: 'live', until };
		}
	}

	// no session at all, or one that ran out. Both leave the same move to make, and the two are
	// deliberately not told apart: a hosted workspace holding nothing has not signed in either.
	return { kind: 'signInRequired', action: 'signInWithGoogle' };
}

/**
 * Where the workspace this state describes stands right now.
 *
 * The one impure entry point, and it is thin on purpose: it takes the window off the state the
 * shell reported and hands it, with the wall clock, to {@link replicationStanding} — which is
 * where the rule lives and where it is tested against a clock a test controls.
 */
export function workspaceReplicationStanding(
	state: RemoteSyncState | null | undefined,
	now: number = Date.now()
): ReplicationStanding {
	return replicationStanding({
		provider: state?.workspace?.provider,
		session: state?.session ?? null,
		now
	});
}
