import assert from 'node:assert/strict';
import test from 'node:test';

import type { RemoteSyncAccount, RemoteSyncProvider } from '$lib/platform/host.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import {
	fakeAccount,
	fakeHost,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import { context } from '../context.ts';

// a shell reporting a workspace of record somewhere else, and the person it belongs to.
//
// The state is written out in full by the fixtures behind it. The three fields an identity is
// built from used to be the whole of it, and a context that read a fourth would have been
// covered by a shape the shell never produces.
function shellReporting({
	provider = 'hosted',
	accountId = 'account',
	accounts
}: {
	provider?: RemoteSyncProvider;
	accountId?: string | null;
	accounts?: RemoteSyncAccount[];
} = {}) {
	const state = fakeSyncState({
		accounts: accounts ?? [fakeAccount({ provider: 'hosted' })],
		workspace: fakeWorkspace({ provider, accountId })
	});

	return fakeHost({
		remoteSync: {
			getState: async () => state,
			snapshotNow: async () => state,
			autosaveNow: async () => state,
			googleDrive: fakeHost().remoteSync.googleDrive
		}
	});
}

test('context carries the database, clock, and host it is given', async () => {
	const db = createMemoryDatabase();
	const clock = { now: () => 42 };
	const host = fakeHost();

	const ctx = await context({ db, clock, host });

	assert.equal(ctx.db, db);
	assert.equal(ctx.clock, clock);
	assert.equal(ctx.host, host);
});

test('a local request carries exactly the three ambient members', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: fakeHost()
	});

	assert.deepEqual(Object.keys(ctx).sort(), ['clock', 'db', 'host']);
});

test('an omitted clock defaults to the system clock', async () => {
	const before = Date.now();
	const ctx = await context({ db: createMemoryDatabase(), host: fakeHost() });
	const now = ctx.clock.now();
	const after = Date.now();

	assert.equal(typeof now, 'number');
	assert.ok(now >= before && now <= after, 'clock.now() reports the current wall-clock time');
});

test('a hosted workspace gives the request the person acting', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting()
	});

	assert.deepEqual(ctx.identity, {
		accountId: 'account',
		email: 'person@example.com',
		displayName: 'Person Example'
	});
});

// the second half of the pair, and the half that matters: a local workspace has no owner, so a
// request carrying no identity is the ordinary case and not a failure to find one.
test('a local workspace leaves the key absent rather than present and holding nothing', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting({ provider: 'local' })
	});

	assert.equal(ctx.identity, undefined);
	assert.ok(!('identity' in ctx), 'a local request grew an identity key holding nothing');
});

// signing in is its own act, so somebody may be signed in with a purely local workspace. The
// mode decides whether a request has an actor, and this pins that it is the mode and not the
// account — the same conflation this effort took apart one ticket ago.
test('being signed in does not give a local request an actor', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting({ provider: 'googleDrive', accountId: 'account' })
	});

	assert.equal(ctx.identity, undefined);
});

// a hosted workspace naming an account nobody holds is not an actor either. It is the shape a
// half-written store would have, and inventing a person to fill it is the placeholder that was
// rejected wearing a different hat.
test('a hosted workspace naming an account that is not there has no actor', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting({ accountId: 'account-nobody-holds' })
	});

	assert.equal(ctx.identity, undefined);
});

// every router test builds its context over a fake host covering only what its procedures read.
// A context that demanded an answer here would fail all of them, and would fail a real boot that
// asked before the shell could reply.
//
// A shell that cannot answer is one whose `getState` rejects, and that is the only shape of it a
// `Host` has. This used to loop over three: a host with no `remoteSync`, one whose `remoteSync`
// had no `getState`, and one that threw. The first two are not hosts — nothing implementing the
// port can be either of them — and they were reachable only while nothing type-checked this
// file (#561).
test('a host that cannot say what mode the workspace is in leaves the request without an actor', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: fakeHost()
	});

	assert.equal(ctx.identity, undefined, 'a host that could not answer produced an actor');
});

test('a supplied identity is carried as given, like every other member', async () => {
	const identity = { accountId: 'account-2', email: 'other@example.com', displayName: 'Other' };
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: fakeHost(),
		identity
	});

	assert.equal(ctx.identity, identity);
});

// absent and `undefined` read the same at a call site, so only the key can say which was meant.
// A test wanting a request with no actor has to be able to say so over a host that would
// otherwise supply one.
test('an identity supplied as undefined overrides the host rather than falling back to it', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting(),
		identity: undefined
	});

	assert.equal(ctx.identity, undefined);
});
