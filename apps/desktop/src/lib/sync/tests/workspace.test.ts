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
/** whether the pull brought another device's writes. */
let replicatesTo = false;
/** whether this machine's writes reached the remote. */
let pushesTo = true;

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
				},
				replicate: async () => {
					calls.push('replicate');

					return { pushed: pushesTo, received: replicatesTo };
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
	replicatesTo = false;
	pushesTo = true;
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

// **Renew, then replicate, and the order is asserted rather than incidental.** Replicating on a
// window that has closed is spending a credential the control plane has already declined; renewing
// first is what makes *any connection inside the window renews it* true of this call.
test('a dispatch renews the window and then replicates', async () => {
	reset();
	shellState = hostedShell(window(3));

	const result = await syncWorkspaceNow(shellState);

	assert.equal(result.action, 'none');
	assert.equal(result.received, false, 'a pull that brought nothing was reported as an event');
	assert.deepEqual(
		calls,
		['renewSession', 'replicate'],
		'the dispatcher did something other than renewing and replicating'
	);
});

// The fourth writer's signal. `received` is what makes the caller reconcile and invalidate, so a
// pull that brought rows and reported `false` would leave every surface showing stale statuses.
test('a pull that brought another device rows says so', async () => {
	reset();
	shellState = hostedShell(window(3));
	replicatesTo = true;

	const result = await syncWorkspaceNow(shellState);

	assert.equal(result.received, true, 'rows arrived and the caller was not told');
	assert.equal(result.pushed, true);
});

// **What arms the retry ladder.** A push that could not reach the remote is reported rather than
// thrown, so nothing above would know to try again if this were not answered.
test('a push that could not reach the remote is reported rather than thrown', async () => {
	reset();
	shellState = hostedShell(window(3));
	pushesTo = false;

	const result = await syncWorkspaceNow(shellState);

	assert.equal(result.pushed, false, 'a push that did not go was reported as having gone');
	assert.equal(result.action, 'none', 'a push that did not go was raised to the user');
});

// **A closed window replicates nothing and discards nothing.** Spending a declined credential is
// pointless; throwing away what is captured would be acceptance criterion 16 failing.
test('a dispatch on a closed window does not replicate', async () => {
	reset();
	shellState = hostedShell(window(-1));

	const result = await syncWorkspaceNow(shellState);

	assert.equal(result.action, 'signInRequired');
	assert.equal(result.received, false);
	assert.ok(!calls.includes('replicate'), 'a closed window still spent its replica credential');
});

// **The last dispatch is the last chance to push**, which is what changed about it in #617: it
// used to be asserted as writing nothing on the way out, when what it must not do is *lose*
// anything. A machine closing with unsynced work should offer it before the window closes.
test('the last dispatch of a session pushes on the way out', async () => {
	reset();
	shellState = hostedShell(window(3));

	const result = await syncWorkspaceBeforeExit(shellState);

	assert.equal(result.action, 'none');
	assert.deepEqual(
		calls,
		['renewSession', 'push'],
		'the last dispatch pulled on the way out, or did not push'
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

	assert.deepEqual(calls, ['renewSession', 'replicate']);
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
