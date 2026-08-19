import assert from 'node:assert/strict';
import test from 'node:test';

import { PendingConflictFlow, workspaceConflictSignature } from './pending-conflict.ts';

function syncState(overrides = {}, accountOverrides = {}) {
	return {
		accounts: [{ id: 'account', status: 'ready', lastError: null, ...accountOverrides }],
		workspace: {
			id: 'workspace',
			accountId: 'account',
			provider: 'googleDrive',
			lastSnapshotAt: 1,
			lastSyncedAt: 2,
			lastRemoteUpdatedAt: 3,
			remoteHeadFileId: 'head',
			remoteHeadRevision: 'revision',
			...overrides
		}
	};
}

const STATE = syncState();
const MOVED_STATE = syncState({ remoteHeadRevision: 'a newer revision' });
const NEXT_STATE = syncState({ lastSyncedAt: 9 });

function preparation(kind = 'sync', overrides = {}) {
	return {
		state: STATE,
		requiresResolution: true,
		recommendedMode: 'push',
		conflict: { kind, accountEmail: 'someone@example.com', message: null },
		...overrides
	};
}

/** a driver whose every step is settled by the test, so ordering is exercised rather than timing. */
function createDriver(overrides = {}) {
	const calls = { resolve: [], cancel: 0, reset: [] };

	return {
		calls,
		resolve: async (prepared, resolution) => {
			calls.resolve.push({ prepared, resolution });
			return { state: NEXT_STATE, action: 'pushed' };
		},
		cancel: async () => {
			calls.cancel += 1;
			return NEXT_STATE;
		},
		reset: async (state) => {
			calls.reset.push(state);
			return NEXT_STATE;
		},
		...overrides
	};
}

const ALL_KINDS = ['link', 'sync', 'corrupt', 'relink'];

// --- Presenting -----------------------------------------------------------------------

test('a conflict that is presented becomes the pending one', () => {
	const flow = new PendingConflictFlow(createDriver());
	const prepared = preparation();

	assert.equal(flow.present(prepared), true);
	assert.equal(flow.preparation, prepared);
	assert.equal(flow.conflict?.kind, 'sync');
});

test('a preparation needing no resolution clears whatever was pending', () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());

	assert.equal(flow.present({ ...preparation(), requiresResolution: false }), false);
	assert.equal(flow.conflict, null);
});

test('nothing at all clears whatever was pending', () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());

	assert.equal(flow.present(null), false);
	assert.equal(flow.conflict, null);
});

// the whole point of one owner: dismissing on one screen has to be remembered on the other,
// and both screens read this same memory.
test('a conflict describing a state the user dismissed is not raised again', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());
	await flow.dismiss();

	assert.equal(flow.present(preparation()), false);
	assert.equal(flow.conflict, null);
});

test('a conflict describing a state that has moved since is raised', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());
	await flow.dismiss();

	assert.equal(flow.present(preparation('sync', { state: MOVED_STATE })), true);
});

test('a conflict about a workspace that describes no state is never taken for a dismissed one', async () => {
	const local = preparation('sync', { state: syncState({ provider: 'local' }) });
	const flow = new PendingConflictFlow(createDriver());
	flow.present(local);
	await flow.dismiss();

	assert.equal(flow.isDismissed(null), false);
	assert.equal(flow.present(local), true);
});

test('forgetting a dismissal lets the same conflict be raised again', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());
	await flow.dismiss();
	flow.forget();

	assert.equal(flow.present(preparation()), true);
});

// --- Resolving ------------------------------------------------------------------------

test('resolving carries the choice to the driver and clears what was pending', async () => {
	const driver = createDriver();
	const flow = new PendingConflictFlow(driver);
	const prepared = preparation();
	flow.present(prepared);

	const result = await flow.resolve('remote');

	assert.deepEqual(driver.calls.resolve, [{ prepared, resolution: 'remote' }]);
	assert.equal(result?.state, NEXT_STATE);
	assert.equal(flow.conflict, null);
	assert.equal(flow.isWorking, false);
});

test('resolving with nothing pending asks the driver for nothing', async () => {
	const driver = createDriver();
	const flow = new PendingConflictFlow(driver);

	assert.equal(await flow.resolve('local'), null);
	assert.equal(driver.calls.resolve.length, 0);
});

// a conflict the remote refused to settle is still a conflict, and the user has to be able
// to answer it again.
test('a resolution that fails leaves the conflict pending', async () => {
	const failure = new Error('the network went away');
	const driver = createDriver({
		resolve: async () => {
			throw failure;
		}
	});
	const flow = new PendingConflictFlow(driver);
	flow.present(preparation());

	await assert.rejects(() => flow.resolve('local'), failure);
	assert.equal(flow.conflict?.kind, 'sync');
	assert.equal(flow.isWorking, false);
});

// the reason the caller's own work is handed in rather than run afterwards: a host that
// carries on after the remote replies would otherwise show whatever it shows with nothing
// pending for the length of it.
test('the question stays presented while the caller settles the answer', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());
	const seen = [];

	await flow.resolve('local', async (outcome) => {
		seen.push({ state: outcome.state, kind: flow.conflict?.kind, isWorking: flow.isWorking });
	});

	assert.deepEqual(seen, [{ state: NEXT_STATE, kind: 'sync', isWorking: true }]);
	assert.equal(flow.conflict, null);
	assert.equal(flow.isWorking, false);
});

// the remote has acted by this point, so the question is answered either way — and a host
// whose own work failed shows that failure rather than the question again.
test('a settling that fails still stops the question being presented', async () => {
	const failure = new Error('startup could not continue');
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());

	await assert.rejects(
		() =>
			flow.resolve('local', async () => {
				throw failure;
			}),
		failure
	);
	assert.equal(flow.conflict, null);
	assert.equal(flow.isWorking, false);
});

test('a question the settling raised is kept rather than cleared', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());

	await flow.resolve('local', async () => {
		flow.present(preparation('corrupt', { state: MOVED_STATE }));
	});

	assert.equal(flow.conflict?.kind, 'corrupt');
});

test('resolving forgets an earlier dismissal, because the state it described is gone', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation());
	await flow.dismiss();
	flow.present(preparation('sync', { state: MOVED_STATE }));
	await flow.resolve('local');

	assert.equal(flow.isDismissed(workspaceConflictSignature(STATE)), false);
});

for (const kind of ALL_KINDS) {
	test(`a ${kind} conflict resolves the same way as every other kind`, async () => {
		const driver = createDriver();
		const flow = new PendingConflictFlow(driver);
		flow.present(preparation(kind));

		const result = await flow.resolve('local');

		assert.equal(driver.calls.resolve.length, 1);
		assert.equal(result?.state, NEXT_STATE);
		assert.equal(flow.conflict, null);
	});
}

// --- Dismissing -----------------------------------------------------------------------

for (const kind of ['sync', 'corrupt', 'relink']) {
	test(`dismissing a ${kind} conflict remembers it and undoes nothing`, async () => {
		const driver = createDriver();
		const flow = new PendingConflictFlow(driver);
		flow.present(preparation(kind));

		const dismissal = await flow.dismiss();

		assert.deepEqual(dismissal, { deferred: true, state: null });
		assert.equal(driver.calls.cancel, 0, 'the workspace still works; there is nothing to undo');
		assert.equal(flow.isDismissed(workspaceConflictSignature(STATE)), true);
		assert.equal(flow.conflict, null);
	});
}

// a link the user decided against has no state to return to, so it is undone rather than
// remembered — and remembering it would suppress the next link they ask for.
test('dismissing a link conflict undoes the link and remembers nothing', async () => {
	const driver = createDriver();
	const flow = new PendingConflictFlow(driver);
	flow.present(preparation('link'));

	const dismissal = await flow.dismiss();

	assert.equal(driver.calls.cancel, 1);
	assert.deepEqual(dismissal, { deferred: false, state: NEXT_STATE });
	assert.equal(flow.isDismissed(workspaceConflictSignature(STATE)), false);
	assert.equal(flow.conflict, null);
});

test('a deferral is handed to the caller with the question still presented', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation('sync'));
	const seen = [];

	await flow.dismiss(async (dismissal) => {
		seen.push({ ...dismissal, kind: flow.conflict?.kind, isWorking: flow.isWorking });
	});

	assert.deepEqual(seen, [{ deferred: true, state: null, kind: 'sync', isWorking: true }]);
	assert.equal(flow.conflict, null);
});

test('an undone link is handed to the caller with the question still presented', async () => {
	const flow = new PendingConflictFlow(createDriver());
	flow.present(preparation('link'));
	const seen = [];

	await flow.dismiss(async (dismissal) => {
		seen.push({ ...dismissal, kind: flow.conflict?.kind });
	});

	assert.deepEqual(seen, [{ deferred: false, state: NEXT_STATE, kind: 'link' }]);
	assert.equal(flow.conflict, null);
});

test('dismissing with nothing pending asks the driver for nothing', async () => {
	const driver = createDriver();
	const flow = new PendingConflictFlow(driver);

	assert.equal(await flow.dismiss(), null);
	assert.equal(driver.calls.cancel, 0);
});

test('a dismissal the remote refuses leaves the conflict pending', async () => {
	const failure = new Error('the remote refused');
	const driver = createDriver({
		cancel: async () => {
			throw failure;
		}
	});
	const flow = new PendingConflictFlow(driver);
	flow.present(preparation('link'));

	await assert.rejects(() => flow.dismiss(), failure);
	assert.equal(flow.conflict?.kind, 'link');
});

// --- Relinking ------------------------------------------------------------------------

test('relinking clears the workspace and leaves nothing pending', async () => {
	const driver = createDriver();
	const flow = new PendingConflictFlow(driver);
	flow.present(preparation('relink'));

	const state = await flow.relink();

	assert.deepEqual(driver.calls.reset, [STATE]);
	assert.equal(state, NEXT_STATE);
	assert.equal(flow.conflict, null);
});

for (const kind of ['link', 'sync', 'corrupt']) {
	test(`relinking is refused for a ${kind} conflict`, async () => {
		const driver = createDriver();
		const flow = new PendingConflictFlow(driver);
		flow.present(preparation(kind));

		assert.equal(await flow.relink(), null);
		assert.equal(driver.calls.reset.length, 0);
		assert.equal(flow.conflict?.kind, kind);
	});
}

// --- One operation at a time ----------------------------------------------------------

test('an operation started while another is outstanding is refused', async () => {
	let settle;
	const driver = createDriver({
		resolve: (prepared, resolution) =>
			new Promise((resolve) => {
				driver.calls.resolve.push({ prepared, resolution });
				settle = () => resolve({ state: NEXT_STATE, action: 'pushed' });
			})
	});
	const flow = new PendingConflictFlow(driver);
	flow.present(preparation());

	const outstanding = flow.resolve('local');

	assert.equal(flow.isWorking, true);
	assert.equal(await flow.resolve('remote'), null);
	assert.equal(await flow.dismiss(), null);

	settle();
	await outstanding;

	assert.equal(driver.calls.resolve.length, 1);
	assert.equal(flow.isWorking, false);
});

// --- Observers ------------------------------------------------------------------------

test('every state change notifies the observer', async () => {
	const flow = new PendingConflictFlow(createDriver());
	let notifications = 0;
	const stop = flow.observe(() => {
		notifications += 1;
	});

	flow.present(preparation());
	await flow.resolve('local');
	const before = notifications;
	stop();
	flow.present(preparation());

	assert.ok(before > 0, 'the reactive wrapper has something to mirror');
	assert.equal(notifications, before, 'a removed observer hears nothing');
});

// --- The signature --------------------------------------------------------------------

test('a workspace that is not on Drive describes no conflict', () => {
	assert.equal(workspaceConflictSignature(syncState({ provider: 'local' })), null);
	assert.equal(workspaceConflictSignature(null), null);
});

test('the same workspace state produces the same signature', () => {
	assert.equal(workspaceConflictSignature(syncState()), workspaceConflictSignature(syncState()));
});

test('a remote that has moved produces a different signature', () => {
	assert.notEqual(
		workspaceConflictSignature(syncState()),
		workspaceConflictSignature(syncState({ remoteHeadRevision: 'a newer revision' }))
	);
});

test('an account that has gone wrong produces a different signature', () => {
	assert.notEqual(
		workspaceConflictSignature(syncState()),
		workspaceConflictSignature(syncState({}, { status: 'needsReconnect' }))
	);
});

// a hosted workspace has no whole-snapshot conflict to describe: the two sides do not exchange
// files, so there is never a pair for the user to choose between. The signature is what the
// dismissal is remembered against, so a hosted workspace answering one would be remembering an
// answer to a question nobody could have been asked.
test('a hosted workspace has no conflict signature', () => {
	assert.equal(workspaceConflictSignature(syncState({ provider: 'hosted' })), null);
	assert.ok(
		workspaceConflictSignature(syncState()),
		'the Drive workspace still has one, so the check above is not passing by accident'
	);
});
