import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { RemoteSyncState, SessionWindow } from '$lib/platform/host.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing.ts';

/**
 * what the dispatcher asked for, and in what order.
 *
 * *Half of this file went with Google Drive sync (decision 07): a workspace linked to a folder,
 * a push, a pull, the recomputation a pull owed, the queue that kept two of them from colliding,
 * and the conflict a sync came back with instead of transferring. What is left is the window,
 * which is what a dispatch was always for on the other arm.*
 */
const calls: string[] = [];

// what the shell reports, and what reaching the control plane does to it. This is the seam the
// application actually uses — the window is read off `getState`/`renewSession`, never written by
// a test reaching past them, which is what makes these cover the shipped path.
let shellState: RemoteSyncState = fakeSyncState();
let renewsTo: RemoteSyncState | 'unreachable' | null = null;

mock.module('$lib/platform/tauri', {
	exports: {
		tauri: {
			remoteSync: {
				getState: async () => shellState,
				renewSession: async () => {
					calls.push('renewSession');

					if (renewsTo === 'unreachable') {
						throw new Error('the control plane could not be reached');
					}

					if (renewsTo) {
						shellState = renewsTo;
					}

					return shellState;
				}
			}
		}
	}
});

const { syncWorkspaceNow, syncWorkspaceBeforeExit } = await import('$lib/sync/workspace');
const { inverseStack } = await import('$lib/design/inverse');

const A_DAY = 24 * 60 * 60 * 1000;

/** a window the control plane issued, `days` from now. */
function window(days: number): SessionWindow {
	const at = Date.now() + days * A_DAY;
	return {
		accountId: 'account-1',
		expiresAt: at,
		replicaExpiresAt: at,
		absoluteExpiresAt: Date.now() + 30 * A_DAY,
		updatedAt: Date.now()
	};
}

/**
 * a build that knows where its control plane is.
 *
 * `controlPlaneReady` is not decoration: the dispatcher refuses to ask for a sign-in a build
 * cannot offer, so a fixture that left it false would exercise that refusal instead of the
 * window this file is about.
 */
function hostedShell(session: SessionWindow | null): RemoteSyncState {
	return fakeSyncState({
		controlPlaneReady: true,
		workspace: fakeWorkspace({ id: 'workspace-1' }),
		session
	});
}

function reset() {
	calls.length = 0;
	renewsTo = null;
	shellState = fakeSyncState();
}

test('a build with no control plane behind it is never asked to sign in to one', async () => {
	for (const session of [null, window(-1), window(3)]) {
		reset();
		const unconfigured = fakeSyncState({
			controlPlaneReady: false,
			workspace: fakeWorkspace({ id: 'workspace-1' }),
			session
		});

		assert.equal((await syncWorkspaceNow(unconfigured)).action, 'none');
		assert.equal((await syncWorkspaceBeforeExit(unconfigured)).action, 'none');
		assert.deepEqual(calls, [], 'a build with nowhere to sign in reached for a session anyway');
	}
});

test('a dispatch reaches the control plane and does nothing else', async () => {
	reset();
	shellState = hostedShell(window(3));

	const result = await syncWorkspaceNow(shellState);

	assert.equal(result.action, 'none');
	assert.deepEqual(
		calls,
		['renewSession'],
		'the dispatcher did something to the workspace besides renewing'
	);
});

test('the last dispatch of a session writes nothing on the way out', async () => {
	reset();
	shellState = hostedShell(window(3));

	const result = await syncWorkspaceBeforeExit(shellState);

	assert.equal(result.action, 'none');
	assert.deepEqual(
		calls,
		['renewSession'],
		'the last dispatch did something other than ask about the window'
	);
});

// #550, acceptance criterion 16, through the shipped path: the dispatcher renews, then reads the
// window off the state the shell reports. Nothing here writes a session directly.
test('a workspace out of contact for three days asks for a sign-in', async () => {
	reset();
	shellState = hostedShell(window(-1));
	renewsTo = 'unreachable';

	const result = await syncWorkspaceNow(shellState);

	assert.equal(result.action, 'signInRequired');
	assert.deepEqual(calls, ['renewSession'], 'the dispatcher never tried to renew');
});

test('it asks on the way out as well, rather than leaving one door open', async () => {
	reset();
	shellState = hostedShell(window(-1));
	renewsTo = 'unreachable';

	assert.equal((await syncWorkspaceBeforeExit(shellState)).action, 'signInRequired');
});

// Criterion 2, and the reach that makes it pass: the window had run out on this machine, the
// control plane was reachable, and renewing restarted it. **Nothing but the renewal changed** —
// the same dispatch on the same state asks where the reach fails and does not where it succeeds.
test('a reach inside the window renews it, and the dispatcher stops asking', async () => {
	reset();
	shellState = hostedShell(window(-1));
	renewsTo = hostedShell(window(3));

	const result = await syncWorkspaceNow(shellState);

	assert.deepEqual(calls, ['renewSession']);
	assert.equal(result.action, 'none', 'it asked for a sign-in it had just renewed past');
	assert.equal(result.state, renewsTo, 'the caller was handed the window it no longer holds');
});

// The third criterion, and the one an expiry fails outright if it is got wrong: producing the
// refusal costs nothing written during the window. Every route the dispatcher has to a write is
// on `calls`, and the undo stack is the one piece of session state anything here could clear.
test('nothing written during the window is discarded to produce the refusal', async () => {
	reset();
	shellState = hostedShell(window(-1));
	renewsTo = 'unreachable';
	inverseStack.clear();
	inverseStack.record({ describe: () => 'a payment', undo: async () => {}, redo: async () => {} });

	const state = shellState;
	const result = await syncWorkspaceNow(state);

	assert.equal(result.action, 'signInRequired');
	assert.deepEqual(calls, ['renewSession'], 'the refusal wrote something');
	assert.ok(inverseStack.undoable, 'the refusal threw away work the session could still undo');
	assert.equal(
		result.state,
		state,
		'the refusal handed back a workspace other than the one it was given'
	);

	inverseStack.clear();
});
