import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { RemoteSyncState, ReplicationRefusal } from '$lib/platform/host.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing.ts';

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

mock.module('$lib/platform/tauri', {
	exports: {
		tauri: {
			remoteSync: {
				getState: async () => shellState,
				replicate: async () => {
					calls.push('replicate');

					return { pushed: pushesTo, received: replicatesTo, refusal: refusesWith };
				},
				push: async () => {
					calls.push('push');

					return pushesTo;
				}
			}
		}
	}
});

const { syncWorkspaceNow, syncWorkspaceBeforeExit } = await import('$lib/sync/workspace');
const { inverseStack } = await import('$lib/design/inverse');

function reset() {
	calls.length = 0;
	replicatesTo = false;
	pushesTo = true;
	refusesWith = 'none';
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
