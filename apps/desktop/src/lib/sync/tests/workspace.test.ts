import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { HeldByVersion } from '$lib/organization/host.ts';
import type { RemoteSyncState, ReplicationRefusal } from '$lib/sync/host.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';

/**
 * THE DISPATCH
 *
 * What one sync of the workspace does, driven through the seam the application uses: the shell
 * is read off `getState`, the replica is pushed and pulled through `replicate`, and the last
 * dispatch of a session pushes on the way out. *A control plane's session window stood in front
 * of the replication until the retirement; the credential is the vault's now, and there is
 * nothing to renew.*
 */

const calls: string[] = [];

let shellState: RemoteSyncState = fakeSyncState({
	workspace: fakeWorkspace({ id: 'workspace-1' })
});
let replicatesTo = false;
let pushesTo = true;
let refusesWith: ReplicationRefusal = 'none';
let heldWith: HeldByVersion | null = null;
let stateFails = false;
// what each replication waits on before it answers, in call order: none, but for the test that
// holds one out.
let replicationGates: Promise<void>[] = [];

mock.module('$lib/sync/tauri', {
	exports: {
		tauri: {
			getState: async () => {
				if (stateFails) throw new Error('the shell did not answer');

				return shellState;
			},
			replicate: async () => {
				calls.push('replicate');
				await replicationGates.shift();

				return {
					pushed: pushesTo,
					received: replicatesTo,
					refusal: refusesWith,
					standing: 'held',
					heldByVersion: heldWith
				};
			},
			push: async () => {
				calls.push('push');

				return pushesTo;
			}
		}
	}
});

const { syncWorkspaceNow, syncWorkspaceBeforeExit } = await import('$lib/sync/workspace');
const { inverseStack } = await import('$lib/undo/undo');

function reset() {
	calls.length = 0;
	replicatesTo = false;
	pushesTo = true;
	refusesWith = 'none';
	heldWith = null;
	stateFails = false;
	replicationGates = [];
	shellState = fakeSyncState({ workspace: fakeWorkspace({ id: 'workspace-1' }) });
}

test('a dispatch replicates, and nothing is asked of anybody first', async () => {
	reset();

	const result = await syncWorkspaceNow();

	assert.deepEqual(calls, ['replicate']);
	assert.equal(result.action, 'none');
	assert.equal(result.state, shellState);
});

test('a pull that brought another device rows says so', async () => {
	reset();
	replicatesTo = true;

	const result = await syncWorkspaceNow();

	assert.equal(result.received, true);
});

test('a push that could not reach the remote is reported rather than thrown', async () => {
	reset();
	pushesTo = false;

	const result = await syncWorkspaceNow();

	assert.equal(result.pushed, false);
	assert.equal(result.action, 'none');
});

// requirement 25: the refusal comes back with the result, so the surface that asked can read it.
test('a replication the account was refused for says so on the result', async () => {
	reset();
	pushesTo = false;
	refusesWith = 'account';

	const result = await syncWorkspaceNow();

	assert.equal(result.refusal, 'account');
});

// effort 857, ticket 12: the verdict the shell reached after the pull is on the result as it was
// judged, for startup to move on before anything else is written.
test('a replication that pulled a raise carries the verdict on the result', async () => {
	reset();
	heldWith = { target: 'organization', standing: 'unreadable', reason: 'past this version' };

	const result = await syncWorkspaceNow();

	assert.deepEqual(result.heldByVersion, heldWith);
});

test('the last dispatch of a session pushes on the way out, and does not pull', async () => {
	reset();

	const result = await syncWorkspaceBeforeExit();

	assert.deepEqual(calls, ['push']);
	assert.equal(result.pushed, true);
	assert.equal(result.received, false);
});

// nothing written is discarded to produce a refusal: the undo stack is untouched by a dispatch.
test('a dispatch leaves what was written where it was', async () => {
	reset();
	pushesTo = false;

	const before = inverseStack.undoable;

	await syncWorkspaceNow();

	assert.equal(inverseStack.undoable, before);
});

// effort 846, requirement 12: the sync group says syncing while a run is out, read off a count
// kept where every run passes, so the control and the sync manager are both counted.
test('a run is counted while it is out, and no longer once it ends, however it ends', async () => {
	reset();

	const { syncActivity } = await import('$lib/sync/activity.svelte');

	assert.equal(syncActivity.inFlight, false);

	let release = () => {};
	replicationGates = [Promise.resolve(), new Promise((resolve) => (release = resolve))];

	const first = syncWorkspaceNow();
	const second = syncWorkspaceNow();

	assert.equal(syncActivity.inFlight, true);

	await first;

	// the other is still out, so one finishing does not say nothing runs.
	assert.equal(syncActivity.inFlight, true);

	release();
	await second;

	assert.equal(syncActivity.inFlight, false);

	// a run whose state could not be read ends counted out too.
	stateFails = true;

	await assert.rejects(syncWorkspaceNow());

	assert.equal(syncActivity.inFlight, false);
});
