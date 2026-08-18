import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type {
	GoogleDriveLinkPreparation,
	GoogleDriveSyncOutcome,
	RemoteSyncState,
	SessionWindow
} from '$lib/platform/host.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing.ts';

// both substitutes reach code this harness cannot load — the api caller opens a
// database, the facade calls into tauri — and both are also the assertion: what
// the dispatcher asked for, and in what order.
const calls: string[] = [];

let syncOutcome: GoogleDriveSyncOutcome = {
	state: fakeSyncState(),
	action: 'none',
	preparation: null
};
let syncGate: Promise<void> | null = null;

// what the shell reports, and what reaching the control plane does to it. This is the seam the
// application actually uses — the window is read off `getState`/`renewSession`, never written by
// a test reaching past them, which is what makes these cover the shipped path.
let shellState: RemoteSyncState = fakeSyncState();
let renewsTo: RemoteSyncState | 'unreachable' | null = null;

mock.module('$lib/api/caller', {
	exports: {
		default: {
			app: {
				state: {
					reconcile: async () => {
						calls.push('reconcile');
					}
				}
			}
		}
	}
});

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
				autosaveNow: async () => {
					calls.push('autosaveNow');
					return fakeSyncState({ workspace: fakeWorkspace({ provider: 'local' }) });
				},
				googleDrive: {
					sync: async (input?: { manual?: boolean }) => {
						calls.push(`sync:${input?.manual ?? false}`);
						if (syncGate) {
							await syncGate;
						}
						calls.push('sync:done');

						return syncOutcome;
					}
				}
			}
		}
	}
});

const {
	syncWorkspaceNow,
	syncWorkspaceBeforeExit,
	inspectWorkspaceSyncState,
	shouldChooseWorkspaceMode
} = await import('$lib/sync/workspace');
const { inverseStack } = await import('$lib/design/inverse');

const A_DAY = 24 * 60 * 60 * 1000;

/** a window the control plane issued, `days` from now. */
function window(days: number): SessionWindow {
	const at = Date.now() + days * A_DAY;
	return { accountId: 'account-1', expiresAt: at, replicaExpiresAt: at, updatedAt: Date.now() };
}

function hostedShell(session: SessionWindow | null): RemoteSyncState {
	return fakeSyncState({
		googleDriveReady: false,
		workspace: fakeWorkspace({ id: 'workspace-1', provider: 'hosted', accountId: 'account-1' }),
		session
	});
}

function driveState() {
	return fakeSyncState({
		googleDriveReady: true,
		workspace: fakeWorkspace({
			id: 'workspace-1',
			provider: 'googleDrive',
			accountId: 'account-1'
		})
	});
}

function reset(outcome?: GoogleDriveSyncOutcome) {
	calls.length = 0;
	syncGate = null;
	renewsTo = null;
	shellState = fakeSyncState();
	syncOutcome = outcome ?? { state: driveState(), action: 'none', preparation: null };
}

test('a linked workspace syncs through one command and nothing else', async () => {
	reset();

	const result = await syncWorkspaceNow(driveState(), { manual: true });

	assert.deepEqual(calls, ['sync:true', 'sync:done']);
	assert.equal(result.action, 'none');
	assert.equal(result.preparation, null);
});

test('a pull recomputes the statuses derived from the database it replaced', async () => {
	reset({ state: driveState(), action: 'pulled', preparation: null });

	const result = await syncWorkspaceNow(driveState());

	assert.equal(result.action, 'pulled');
	assert.deepEqual(calls, ['sync:false', 'sync:done', 'reconcile']);
});

// an inverse is a statement about a database, and a pull replaces the one it was written
// against. Replaying it there would corrupt rather than undo.
test('a pull leaves nothing on the undo stack that could be applied to it', async () => {
	reset({ state: driveState(), action: 'pulled', preparation: null });
	inverseStack.record({ describe: () => 'a change', undo: async () => {}, redo: async () => {} });

	await syncWorkspaceNow(driveState());

	assert.equal(inverseStack.undoable, null);
	assert.equal(await inverseStack.undo(), null);
});

test('a push leaves the session’s inverses where they are', async () => {
	reset({ state: driveState(), action: 'pushed', preparation: null });
	inverseStack.clear();
	inverseStack.record({ describe: () => 'a change', undo: async () => {}, redo: async () => {} });

	await syncWorkspaceNow(driveState());

	assert.ok(inverseStack.undoable, 'a push discarded inverses the workspace still holds');
	inverseStack.clear();
});

test('a push leaves the local statuses alone', async () => {
	reset({ state: driveState(), action: 'pushed', preparation: null });

	await syncWorkspaceNow(driveState());

	assert.ok(!calls.includes('reconcile'), 'a push recomputed statuses nothing had invalidated');
});

test('a sync needing a decision reports it and transfers nothing', async () => {
	const preparation: GoogleDriveLinkPreparation = {
		state: driveState(),
		requiresResolution: true,
		recommendedMode: 'push',
		conflict: {
			kind: 'sync',
			accountEmail: 'someone@example.com',
			localSnapshotAt: null,
			remoteUpdatedAt: null,
			remoteFilename: null,
			message: null
		}
	};
	reset({ state: driveState(), action: 'none', preparation });

	const result = await syncWorkspaceNow(driveState());

	assert.equal(result.preparation, preparation);
	assert.equal(result.action, 'none');
	assert.ok(!calls.includes('reconcile'), 'a deferred sync touched the local database');
});

test('an unlinked workspace is snapshotted locally only where the caller asked', async () => {
	const localState = fakeSyncState({
		googleDriveReady: false,
		workspace: fakeWorkspace({ id: 'w', provider: 'local' })
	});

	reset();
	assert.equal((await syncWorkspaceNow(localState)).action, 'none');
	assert.deepEqual(calls, []);

	reset();
	assert.equal((await syncWorkspaceNow(localState, { autosaveLocal: true })).action, 'autosaved');
	assert.deepEqual(calls, ['autosaveNow']);
});

test('the last sync of a session recomputes before it sends, not after', async () => {
	reset();

	await syncWorkspaceBeforeExit(driveState());

	assert.deepEqual(
		calls,
		['reconcile', 'sync:false', 'sync:done'],
		'the workspace was sent as it stood before its derived statuses were recomputed'
	);
});

test('a second sync waits for the first rather than colliding with it', async () => {
	reset();

	let release = () => {};
	syncGate = new Promise<void>((resolve) => {
		release = () => resolve();
	});

	const first = syncWorkspaceNow(driveState());
	const second = syncWorkspaceNow(driveState(), { manual: true });

	release();
	await Promise.all([first, second]);

	assert.deepEqual(
		calls,
		['sync:false', 'sync:done', 'sync:true', 'sync:done'],
		'two syncs overlapped, so the second would have found the lock held'
	);
});

// THE THIRD VALUE
//
// `provider` has three values now, and every branch that reads it has to answer for the one
// that is neither `local` nor `googleDrive`. These are not tests that the hosted transport
// works — it does not exist yet (#548). They are tests that the existing dispatcher does not
// mistake a hosted workspace for a Drive one or for an unlinked one, which is what a
// `!== 'googleDrive'` and a `=== 'local'` respectively would do if nobody checked.

function hostedState() {
	return fakeSyncState({
		googleDriveReady: true,
		workspace: fakeWorkspace({
			id: 'workspace-1',
			provider: 'hosted',
			accountId: 'account-1'
		})
	});
}

test('a hosted workspace is not asked to choose a mode it has already chosen', () => {
	assert.equal(shouldChooseWorkspaceMode(hostedState()), false);
	assert.equal(
		shouldChooseWorkspaceMode(
			fakeSyncState({ googleDriveReady: true, workspace: fakeWorkspace({ provider: 'local' }) })
		),
		true,
		'the local workspace is the one still to be asked'
	);
});

test('a hosted workspace has nothing to inspect, and asks Drive nothing', async () => {
	reset();

	assert.equal(await inspectWorkspaceSyncState(hostedState()), null);
	assert.deepEqual(calls, [], 'a Drive inspection was issued for a workspace with no Drive');
});

test('a hosted workspace neither syncs through Drive nor takes a local snapshot', async () => {
	reset();
	shellState = hostedShell(window(3));

	const result = await syncWorkspaceNow(shellState, { manual: true, autosaveLocal: true });

	assert.equal(result.action, 'none');
	assert.deepEqual(
		calls,
		['renewSession'],
		'the dispatcher acted on a workspace it has no transport for'
	);
});

test('a hosted workspace takes no snapshot on the way out either', async () => {
	reset();
	shellState = hostedShell(window(3));

	const result = await syncWorkspaceBeforeExit(shellState);

	assert.equal(result.action, 'none');
	assert.deepEqual(
		calls,
		['renewSession'],
		'a hosted workspace was autosaved to this machine as though it were local'
	);
});

// #550, acceptance criterion 16, through the shipped path: the dispatcher renews, then reads the
// window off the state the shell reports. Nothing here writes a session directly.
test('a hosted workspace out of contact for three days asks for a sign-in', async () => {
	reset();
	shellState = hostedShell(window(-1));
	renewsTo = 'unreachable';

	const result = await syncWorkspaceNow(shellState, { manual: true, autosaveLocal: true });

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

	const result = await syncWorkspaceNow(shellState, { manual: true });

	assert.deepEqual(calls, ['renewSession']);
	assert.equal(result.action, 'none', 'it asked for a sign-in it had just renewed past');
	assert.equal(result.state, renewsTo, 'the caller was handed the window it no longer holds');
});

// The third criterion, and the one an expiry fails outright if it is got wrong: producing the
// refusal costs nothing written during the window. Every route the dispatcher has to a write is
// on `calls` — the autosave, the Drive sync, the reconcile — and the undo stack is the one piece
// of session state a pull is allowed to clear.
test('nothing written during the window is discarded to produce the refusal', async () => {
	reset();
	shellState = hostedShell(window(-1));
	renewsTo = 'unreachable';
	inverseStack.clear();
	inverseStack.record({ describe: () => 'a payment', undo: async () => {}, redo: async () => {} });

	const state = shellState;
	const result = await syncWorkspaceNow(state, { manual: true, autosaveLocal: true });

	assert.equal(result.action, 'signInRequired');
	assert.deepEqual(
		calls,
		['renewSession'],
		'the refusal wrote, snapshotted or reconciled something'
	);
	assert.ok(inverseStack.undoable, 'the refusal threw away work the session could still undo');
	assert.equal(
		result.state,
		state,
		'the refusal handed back a workspace other than the one it was given'
	);

	inverseStack.clear();
});

// The last clause of criterion 16, run through the same dispatcher. A local workspace never
// reaches the control plane at all, whatever this machine happens to be holding.
test('a local workspace run through the same path never asks for anything', async () => {
	for (const session of [null, window(-1), window(3)]) {
		reset();
		shellState = fakeSyncState({
			googleDriveReady: false,
			workspace: fakeWorkspace({ provider: 'local' }),
			session
		});

		const localState = shellState;

		assert.equal((await syncWorkspaceNow(localState)).action, 'none');
		assert.equal((await syncWorkspaceNow(localState, { autosaveLocal: true })).action, 'autosaved');
		assert.equal((await syncWorkspaceBeforeExit(localState)).action, 'autosaved');
		assert.ok(!calls.includes('renewSession'), 'a local workspace reached the control plane');
	}
});
