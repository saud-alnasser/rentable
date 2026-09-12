import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing';
import { syncStatusOf, syncStatusVariant } from '$lib/workspace/sync-status';

/**
 * THE BADGE'S ORDER
 *
 * Three answers, in an order that is a decision. *There were six until the control plane
 * retired, and four of them described a service.*
 */

test('a machine reaching its workspace reads as synced', () => {
	assert.equal(syncStatusOf(fakeSyncState()), 'synced');
	assert.equal(syncStatusVariant('synced'), 'default');
});

test('a fault on the workspace needs reconnecting, and is an error tone', () => {
	const state = fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) });

	assert.equal(syncStatusOf(state), 'needsReconnect');
	assert.equal(syncStatusVariant('needsReconnect'), 'error');
});

// requirement 25: the account's refusal is read before a fault, because it is the thing the
// owner has to see to first, and it is its own word rather than a reconnect.
test('the account being refused reads first, and apart from a fault', () => {
	const refused = fakeSyncState({
		accountRefusal: { since: 1 },
		workspace: fakeWorkspace({ lastError: 'something stale' })
	});

	assert.equal(syncStatusOf(refused), 'accountRefused');
	assert.equal(syncStatusVariant('accountRefused'), 'error');
	assert.notEqual(syncStatusOf(refused), syncStatusOf(fakeSyncState()));
});

// F5: a credential Turso refused and a reconnect did not settle is its own answer, read before a
// fault (a definite reason nothing syncs, where a fault is a stale report) and after the account's
// (which is the owner's to see to first).
test('a refused credential reads as its own status, after the account and before a fault', () => {
	const state = fakeSyncState({
		credentialRefusal: { since: 2 },
		workspace: fakeWorkspace({ lastError: 'something stale' })
	});

	assert.equal(syncStatusOf(state), 'credentialRefused');
	assert.equal(syncStatusVariant('credentialRefused'), 'error');

	const account = fakeSyncState({
		accountRefusal: { since: 1 },
		credentialRefusal: { since: 2 }
	});
	assert.equal(syncStatusOf(account), 'accountRefused');
});
