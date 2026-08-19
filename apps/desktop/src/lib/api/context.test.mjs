import assert from 'node:assert/strict';
import test from 'node:test';

import { context } from './context.ts';

// a shell reporting a workspace of record somewhere else, and the person it belongs to.
function shellReporting({ provider = 'hosted', accountId = 'account-1', accounts } = {}) {
	return {
		remoteSync: {
			getState: async () => ({
				workspace: { provider, accountId },
				accounts: accounts ?? [
					{ id: 'account-1', email: 'person@example.com', displayName: 'Person Example' }
				]
			})
		}
	};
}

test('context carries the database, clock, and host it is given', async () => {
	const db = { marker: 'db' };
	const clock = { now: () => 42 };
	const host = { marker: 'host' };

	const ctx = await context({ db, clock, host });

	assert.equal(ctx.db, db);
	assert.equal(ctx.clock, clock);
	assert.equal(ctx.host, host);
});

test('a local request carries exactly the three ambient members', async () => {
	const ctx = await context({ db: {}, clock: { now: () => 0 }, host: {} });

	assert.deepEqual(Object.keys(ctx).sort(), ['clock', 'db', 'host']);
});

test('an omitted clock defaults to the system clock', async () => {
	const before = Date.now();
	const ctx = await context({ db: {}, host: {} });
	const now = ctx.clock.now();
	const after = Date.now();

	assert.equal(typeof now, 'number');
	assert.ok(now >= before && now <= after, 'clock.now() reports the current wall-clock time');
});

test('a hosted workspace gives the request the person acting', async () => {
	const ctx = await context({ db: {}, clock: { now: () => 0 }, host: shellReporting() });

	assert.deepEqual(ctx.identity, {
		accountId: 'account-1',
		email: 'person@example.com',
		displayName: 'Person Example'
	});
});

// the second half of the pair, and the half that matters: a local workspace has no owner, so a
// request carrying no identity is the ordinary case and not a failure to find one.
test('a local workspace leaves the key absent rather than present and holding nothing', async () => {
	const ctx = await context({
		db: {},
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
		db: {},
		clock: { now: () => 0 },
		host: shellReporting({ provider: 'googleDrive', accountId: 'account-1' })
	});

	assert.equal(ctx.identity, undefined);
});

// a hosted workspace naming an account nobody holds is not an actor either. It is the shape a
// half-written store would have, and inventing a person to fill it is the placeholder that was
// rejected wearing a different hat.
test('a hosted workspace naming an account that is not there has no actor', async () => {
	const ctx = await context({
		db: {},
		clock: { now: () => 0 },
		host: shellReporting({ accountId: 'account-nobody-holds' })
	});

	assert.equal(ctx.identity, undefined);
});

// every router test builds its context over a fake host covering only what its procedures read.
// A context that demanded an answer here would fail all of them, and would fail a real boot that
// asked before the shell could reply.
test('a host that cannot say what mode the workspace is in leaves the request without an actor', async () => {
	const unanswering = [
		{},
		{ remoteSync: {} },
		{
			remoteSync: {
				getState: async () => {
					throw new Error('the shell is not ready');
				}
			}
		}
	];

	for (const host of unanswering) {
		const ctx = await context({ db: {}, clock: { now: () => 0 }, host });

		assert.equal(ctx.identity, undefined, 'a host that could not answer produced an actor');
	}
});

test('a supplied identity is carried as given, like every other member', async () => {
	const identity = { accountId: 'account-2', email: 'other@example.com', displayName: 'Other' };
	const ctx = await context({ db: {}, clock: { now: () => 0 }, host: {}, identity });

	assert.equal(ctx.identity, identity);
});

// absent and `undefined` read the same at a call site, so only the key can say which was meant.
// A test wanting a request with no actor has to be able to say so over a host that would
// otherwise supply one.
test('an identity supplied as undefined overrides the host rather than falling back to it', async () => {
	const ctx = await context({
		db: {},
		clock: { now: () => 0 },
		host: shellReporting(),
		identity: undefined
	});

	assert.equal(ctx.identity, undefined);
});
