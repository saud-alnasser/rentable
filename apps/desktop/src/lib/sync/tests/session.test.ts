import assert from 'node:assert/strict';
import test from 'node:test';

import {
	replicationStanding,
	workspaceReplicationStanding,
	type SessionWindow
} from '$lib/sync/session';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);
const A_DAY = 24 * 60 * 60 * 1000;

/**
 * a window the control plane issued, three days out and a month of sign-in behind it.
 *
 * `replicaExpiresAt` follows `expiresAt` because that is what the mint answers with — the two are
 * only apart where something moved one of them alone, which is what the drift tests below do on
 * purpose. `absoluteExpiresAt` runs from the sign-in rather than from this moment, because a
 * refresh does not move it; `signedInAt` is how a test says the sign-in was longer ago.
 */
function issuedAt(
	moment: number,
	replicaAt: number | null = moment,
	signedInAt: number = moment
): SessionWindow {
	return {
		accountId: 'account-1',
		expiresAt: moment + 3 * A_DAY,
		replicaExpiresAt: replicaAt === null ? null : replicaAt + 3 * A_DAY,
		absoluteExpiresAt: signedInAt + 30 * A_DAY,
		updatedAt: moment
	};
}

/** the state the shell reports, which is where the window actually comes from. */
function shellReporting(session: SessionWindow | null) {
	return { workspace: {}, session } as never;
}

// Acceptance criterion 16, the half that must ask. The clock moves and nothing else does.
test('a hosted workspace three days out of contact asks for a sign-in, and names the action', () => {
	const standing = replicationStanding({
		session: issuedAt(AT),
		now: AT + 3 * A_DAY
	});

	assert.deepEqual(standing, { kind: 'signInRequired', action: 'signInWithGoogle' });
});

// The other half: one successful reach inside the window, and the window restarts from the reach
// rather than from the sign-in. The reach is what replaces the window the shell reports.
test('a reach inside the window restarts the window, and it does not ask', () => {
	const reachedAt = AT + 3 * A_DAY - 1;

	assert.equal(replicationStanding({ session: issuedAt(AT), now: reachedAt }).kind, 'live');

	assert.deepEqual(
		replicationStanding({
			session: issuedAt(reachedAt),
			now: reachedAt + 3 * A_DAY - 1
		}),
		{ kind: 'live', until: reachedAt + 3 * A_DAY }
	);
});

// Three days is where an off-by-one costs somebody a sign-in, and it is the same boundary the
// control plane takes: the moment it named is the first one outside the window.
test('the last millisecond of the window is inside it and the first one after is not', () => {
	const session = issuedAt(AT);

	assert.equal(replicationStanding({ session, now: AT + 3 * A_DAY - 1 }).kind, 'live');
	assert.equal(replicationStanding({ session, now: AT + 3 * A_DAY }).kind, 'signInRequired');
});

// **The two windows are started by different calls, so equal lengths prove nothing.** Sign in and
// mint at T0, refresh at T0+2d: the session runs to T0+5d and the credential the replica actually
// syncs with still dies at T0+3d. A client reading only the session's would go on believing it may
// replicate for two days after replication had become impossible.
test('the credential that carries replication governs, even where the session outlives it', () => {
	const drifted: SessionWindow = {
		accountId: 'account-1',
		expiresAt: AT + 5 * A_DAY,
		replicaExpiresAt: AT + 3 * A_DAY,
		absoluteExpiresAt: AT + 30 * A_DAY,
		updatedAt: AT + 2 * A_DAY
	};

	assert.deepEqual(replicationStanding({ session: drifted, now: AT + 3 * A_DAY - 1 }), {
		kind: 'live',
		until: AT + 3 * A_DAY
	});

	assert.deepEqual(
		replicationStanding({ session: drifted, now: AT + 3 * A_DAY }),
		{ kind: 'signInRequired', action: 'signInWithGoogle' },
		'the client believed a session that outlived the credential it needed'
	);
});

// And the other direction, which is the ordinary one: a session that closes first ends the window
// even though the replica credential would have lasted longer.
test('a session that closes first ends the window too', () => {
	const drifted: SessionWindow = {
		accountId: 'account-1',
		expiresAt: AT + 2 * A_DAY,
		replicaExpiresAt: AT + 5 * A_DAY,
		absoluteExpiresAt: AT + 30 * A_DAY,
		updatedAt: AT
	};

	assert.equal(
		replicationStanding({ session: drifted, now: AT + 2 * A_DAY }).kind,
		'signInRequired'
	);
});

// Between signing in and the first mint there is no replica credential, and that is not a window
// of length zero — nothing has started it.
test('a window with nothing minted yet runs on the session alone', () => {
	assert.deepEqual(replicationStanding({ session: issuedAt(AT, null), now: AT + A_DAY }), {
		kind: 'live',
		until: AT + 3 * A_DAY
	});
});
// **The third moment, and the one no reach can move.** A client that has reached every day holds
// a refresh window three days out and a replica credential to match; what it must still believe
// is the month behind them. Read only the first two and the application goes on working a year
// after the sign-in it is working under ran out.
test('the absolute lifetime governs, however faithfully the client has been reaching', () => {
	// signed in a month ago, refreshed a moment ago: both sliding windows are wide open.
	const aged = issuedAt(AT + 30 * A_DAY, AT + 30 * A_DAY, AT);

	assert.deepEqual(replicationStanding({ session: aged, now: AT + 30 * A_DAY - 1 }), {
		kind: 'live',
		until: AT + 30 * A_DAY
	});

	assert.deepEqual(
		replicationStanding({ session: aged, now: AT + 30 * A_DAY }),
		{ kind: 'signInRequired', action: 'signInWithGoogle' },
		'a month of faithful reaching carried the sign-in past its lifetime'
	);
});

// And it does not shorten anything: a sign-in with a month to run leaves the refresh window to
// decide, which is the ordinary case and would be broken by a `min` over the wrong operand.
test('a sign-in with a month left leaves the refresh window in charge', () => {
	const fresh = issuedAt(AT);

	assert.deepEqual(replicationStanding({ session: fresh, now: AT + 3 * A_DAY - 1 }), {
		kind: 'live',
		until: AT + 3 * A_DAY
	});
});

// Acceptance criterion 16's last clause used to read *a local workspace is asked for nothing,
// ever*, and it was two tests: one for a workspace kept on this machine and one for a workspace
// kept on Drive. **Both were about the mode, and there is no mode** — every workspace is of record
// in Turso, so every workspace answers to the window. They are not replaced by weaker versions of
// themselves; what survives of them is the guard below, which is about a state that has not
// loaded rather than about a kind of workspace.

// A hosted workspace holding nothing has not signed in, which is the same move as one whose
// window closed. Told apart, the two would need two answers and the user has one thing to do.
test('a workspace holding no session asks the same thing an expired one does', () => {
	assert.deepEqual(replicationStanding({ session: null, now: AT }), {
		kind: 'signInRequired',
		action: 'signInWithGoogle'
	});
});

// The window comes off the state the shell reports, which is what makes it survive a restart:
// Rust persists it beside the workspace, so reopening the application reads the same one back.
test('the standing is read off the state the shell reports', () => {
	assert.equal(workspaceReplicationStanding(shellReporting(issuedAt(AT)), AT + A_DAY).kind, 'live');
	assert.equal(
		workspaceReplicationStanding(shellReporting(issuedAt(AT)), AT + 3 * A_DAY).kind,
		'signInRequired'
	);
	assert.equal(
		workspaceReplicationStanding(null, AT).kind,
		'unsessioned',
		'a state that has not loaded yet asked for a sign-in'
	);
});
