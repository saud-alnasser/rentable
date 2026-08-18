import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// both substitutes reach code this harness cannot load — the api caller opens a
// database, the facade calls into tauri — and both are also the assertion: what
// the dispatcher asked for, and in what order.
const calls = [];

let syncOutcome = { state: { workspace: {} }, action: 'none', preparation: null };
let syncGate = null;

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
				getState: async () => ({ workspace: {} }),
				autosaveNow: async () => {
					calls.push('autosaveNow');
					return { workspace: { provider: 'local' } };
				},
				googleDrive: {
					sync: async (input) => {
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

function driveState() {
	return {
		googleDriveReady: true,
		workspace: { id: 'workspace-1', provider: 'googleDrive', accountId: 'account-1' }
	};
}

function reset(outcome) {
	calls.length = 0;
	syncGate = null;
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
	const preparation = { requiresResolution: true, conflict: { kind: 'sync' } };
	reset({ state: driveState(), action: 'none', preparation });

	const result = await syncWorkspaceNow(driveState());

	assert.equal(result.preparation, preparation);
	assert.equal(result.action, 'none');
	assert.ok(!calls.includes('reconcile'), 'a deferred sync touched the local database');
});

test('an unlinked workspace is snapshotted locally only where the caller asked', async () => {
	const localState = { googleDriveReady: false, workspace: { id: 'w', provider: 'local' } };

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
	syncGate = new Promise((resolve) => {
		release = resolve;
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
	return {
		googleDriveReady: true,
		workspace: { id: 'workspace-1', provider: 'hosted', accountId: 'account-1' }
	};
}

test('a hosted workspace is not asked to choose a mode it has already chosen', () => {
	assert.equal(shouldChooseWorkspaceMode(hostedState()), false);
	assert.equal(
		shouldChooseWorkspaceMode({ googleDriveReady: true, workspace: { provider: 'local' } }),
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

	const result = await syncWorkspaceNow(hostedState(), { manual: true, autosaveLocal: true });

	assert.equal(result.action, 'none');
	assert.deepEqual(calls, [], 'the dispatcher acted on a workspace it has no transport for');
});

test('a hosted workspace takes no snapshot on the way out either', async () => {
	reset();

	const result = await syncWorkspaceBeforeExit(hostedState());

	assert.equal(result.action, 'none');
	assert.deepEqual(
		calls,
		[],
		'a hosted workspace was autosaved to this machine as though it were local'
	);
});
