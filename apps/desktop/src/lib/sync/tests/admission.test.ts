import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeAccount, fakeSyncState } from '$lib/platform/tests/testing.ts';
import { workspaceAdmission } from '$lib/sync/admission';

const AT = Date.UTC(2026, 7, 19, 12, 0, 0);
const A_DAY = 24 * 60 * 60 * 1000;

/** the window a control plane issues at sign-in: three days to reach it, a month to live. */
function issuedAt(moment: number) {
	return {
		accountId: 'account',
		expiresAt: moment + 3 * A_DAY,
		replicaExpiresAt: moment + 3 * A_DAY,
		absoluteExpiresAt: moment + 30 * A_DAY,
		updatedAt: moment
	};
}

// Criterion 3, and the reason this rule exists at all. Nothing about the state says *empty*: the
// workspace row is there, as it is on every install, and it is the account that is not.
test('an install nobody has signed in on is stopped at the door', () => {
	assert.deepEqual(workspaceAdmission(fakeSyncState(), AT), {
		kind: 'signInRequired',
		reason: 'noAccount'
	});
});

// Criterion 4's first half. The account row is the whole of what changes.
test('an install somebody signed in on is let through', () => {
	const account = fakeAccount();

	assert.deepEqual(workspaceAdmission(fakeSyncState({ accounts: [account] }), AT), {
		kind: 'admitted',
		account
	});
});

// Criterion 4's second half, and the reason the row is not the read. Rust keeps the account after
// a sign-out so that whatever was linked under it can still say what it is waiting for — so a
// machine that has signed out looks, row for row, exactly like one that has not.
test('signing out leaves the row behind and the door shut', () => {
	const state = fakeSyncState({
		accounts: [fakeAccount({ status: 'needsReconnect', refreshTokenAvailable: false })]
	});

	assert.deepEqual(workspaceAdmission(state, AT), {
		kind: 'signInRequired',
		reason: 'noAccount'
	});
});

// Requirement 15, from the door's side. Three days offline is a lock rather than a sign-out, and
// the reason is the next test: what the person has to do about it is different.
test('a signed-in machine out of contact past its window is locked out of itself', () => {
	const state = fakeSyncState({
		accounts: [fakeAccount()],
		controlPlaneReady: true,
		session: issuedAt(AT)
	});

	assert.deepEqual(workspaceAdmission(state, AT + 3 * A_DAY - 1), {
		kind: 'admitted',
		account: state.accounts[0]!
	});

	assert.deepEqual(workspaceAdmission(state, AT + 3 * A_DAY), {
		kind: 'signInRequired',
		reason: 'windowClosed'
	});
});

// **The guard that keeps every build today usable.** `establish_session` returns without doing
// anything where no control plane was configured, so such a build holds no session however
// faithfully its user signs in. Reading that as a closed window would put the login page in front
// of somebody who had just answered it — a loop with no way out.
test('a build with no control plane is not a machine that failed to sign in', () => {
	const state = fakeSyncState({ accounts: [fakeAccount()], session: null });

	assert.deepEqual(workspaceAdmission(state, AT + 30 * A_DAY), {
		kind: 'admitted',
		account: state.accounts[0]!
	});
});

// A build that does have one, holding no session, is the other side of that guard: it has
// somewhere to sign in to and has not.
//
// **The reason is `noSession` rather than `windowClosed`, and the difference is the whole of what
// the screen can offer.** This machine answered a consent screen; establishing the session runs
// after that and is allowed to fail, so what it is missing is one call to the control plane rather
// than a fresh identity. Told it had been offline too long, the only move it would be offered is
// the one that already succeeded.
test('a control plane build holding no session is offered the call that failed, not a new sign-in', () => {
	const state = fakeSyncState({
		accounts: [fakeAccount()],
		controlPlaneReady: true,
		session: null
	});

	assert.deepEqual(workspaceAdmission(state, AT), {
		kind: 'signInRequired',
		reason: 'noSession'
	});
});

// The pair the reason exists to keep apart: one window that ran out, one that never started, both
// at the same moment and both refusing entry.
test('a window that ran out and a window that never started are different situations', () => {
	const ranOut = fakeSyncState({
		accounts: [fakeAccount()],
		controlPlaneReady: true,
		session: issuedAt(AT)
	});
	const neverStarted = fakeSyncState({
		accounts: [fakeAccount()],
		controlPlaneReady: true,
		session: null
	});

	const at = AT + 4 * A_DAY;

	assert.deepEqual(workspaceAdmission(ranOut, at), {
		kind: 'signInRequired',
		reason: 'windowClosed'
	});
	assert.deepEqual(workspaceAdmission(neverStarted, at), {
		kind: 'signInRequired',
		reason: 'noSession'
	});
});

// The first read has not come back yet, which is not a refusal. Answering it with one would put
// the login page in front of every launch for as long as the shell takes to reply.
test('a shell that has not reported yet is neither in nor out', () => {
	assert.deepEqual(workspaceAdmission(null, AT), { kind: 'starting' });
	assert.deepEqual(workspaceAdmission(undefined, AT), { kind: 'starting' });
});
