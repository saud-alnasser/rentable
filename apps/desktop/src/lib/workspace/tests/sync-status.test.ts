import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeAccount, fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing';
import { syncStatusOf, syncStatusVariant } from '$lib/workspace/sync-status';

/** a machine that is signed in and reaching its workspace, which every case below spoils one way. */
const working = () =>
	fakeSyncState({
		controlPlaneReady: true,
		googleSignInReady: true,
		accounts: [fakeAccount()],
		session: {
			accountId: 'account',
			expiresAt: 1,
			replicaExpiresAt: 1,
			absoluteExpiresAt: 1,
			updatedAt: 0
		}
	});

test('a machine signed in and reaching its workspace reads as synced', () => {
	assert.equal(syncStatusOf(working()), 'synced');
	assert.equal(syncStatusVariant('synced'), 'default');
});

// The two the fallthrough this replaces got wrong. Both facts sat on the same state object and
// neither was read, so both of these reported *synced*.
test('a build that was never told where a control plane is does not read as synced', () => {
	const state = fakeSyncState({ ...working(), controlPlaneReady: false });

	assert.equal(syncStatusOf(state), 'noControlPlane');
});

test('a machine holding no session does not read as synced', () => {
	const state = fakeSyncState({ ...working(), session: null });

	assert.equal(syncStatusOf(state), 'notSignedIn');
});

test('a machine with no account row does not read as synced', () => {
	const state = fakeSyncState({ ...working(), accounts: [] });

	assert.equal(syncStatusOf(state), 'notSignedIn');
});

test('a build with no OAuth client says so rather than reporting a fault', () => {
	const state = fakeSyncState({ ...working(), googleSignInReady: false });

	assert.equal(syncStatusOf(state), 'cannotSignIn');
	assert.equal(syncStatusVariant('cannotSignIn'), 'secondary', 'not yet is not a fault');
});

test('an account awaiting authorization is pending', () => {
	const state = fakeSyncState({ ...working(), accounts: [fakeAccount({ status: 'pending' })] });

	assert.equal(syncStatusOf(state), 'pending');
});

test('a fault on the workspace or on the account needs reconnecting, and is the one error tone', () => {
	const onWorkspace = fakeSyncState({
		...working(),
		workspace: fakeWorkspace({ lastError: 'the replica would not open' })
	});
	const onAccount = fakeSyncState({
		...working(),
		accounts: [fakeAccount({ lastError: 'the token was refused' })]
	});
	const disconnected = fakeSyncState({
		...working(),
		accounts: [fakeAccount({ status: 'needsReconnect' })]
	});

	assert.equal(syncStatusOf(onWorkspace), 'needsReconnect');
	assert.equal(syncStatusOf(onAccount), 'needsReconnect');
	assert.equal(syncStatusVariant('needsReconnect'), 'error');

	// **The case that caught a real defect.** `signedInAccount` skips a `needsReconnect` row, so
	// this machine has no signed-in account and the status cannot be read off one. It still says
	// *reconnect* rather than *not signed in*: the row is there and reconnecting is the actionable
	// half. The component this replaces reached `needsReconnect` only from a `lastError`, so it
	// had the same hole.
	assert.equal(syncStatusOf(disconnected), 'needsReconnect');
});

test('a stale disconnected row is not the problem of somebody who is signed in', () => {
	const state = fakeSyncState({
		...working(),
		accounts: [fakeAccount({ id: 'gone', status: 'needsReconnect' }), fakeAccount()]
	});

	assert.equal(syncStatusOf(state), 'synced');
});

// The ladder answers a machine that is several of these at once, and the order is what decides.
test('with nowhere to reach, a stale error does not offer a reconnect', () => {
	const state = fakeSyncState({
		...working(),
		controlPlaneReady: false,
		workspace: fakeWorkspace({ lastError: 'from before this build stopped having one' })
	});

	assert.equal(
		syncStatusOf(state),
		'noControlPlane',
		'offering a reconnect to a build with nowhere to connect is worse than saying so'
	);
});

test('signing in is what a machine with no control plane needs told first', () => {
	const state = fakeSyncState({
		...working(),
		controlPlaneReady: false,
		googleSignInReady: false,
		accounts: [],
		session: null
	});

	assert.equal(syncStatusOf(state), 'noControlPlane');
});
