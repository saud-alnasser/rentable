import assert from 'node:assert/strict';
import test from 'node:test';

import type { RemoteSyncAccount } from '$lib/platform/host.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeIdentity } from '$lib/api/tests/testing.ts';
import {
	fakeAccount,
	fakeHost,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import { context } from '../context.ts';

// a shell reporting the account this machine is signed in as.
//
// The state is written out in full by the fixtures behind it. *It used to set
// `workspace.accountId` to `null` deliberately — that field was the Drive link rather than who
// was signed in, and a fixture that set it would have let a context reading the wrong field pass
// every test below. The field went with Drive sync, so there is one place left to read.*
function shellReporting(accounts: RemoteSyncAccount[] = [fakeAccount()]) {
	const state = fakeSyncState({ accounts, workspace: fakeWorkspace() });

	return fakeHost({
		remoteSync: {
			getState: async () => state,
			renewSession: async () => state,
			establishSession: async () => state,
			replicate: async () => ({ pushed: true, received: false }),
			push: async () => true
		}
	});
}

/** who `context()` says is acting, where it cannot name anybody. */
async function actorFrom(overrides: Parameters<typeof context>[0]) {
	return (await context(overrides)).identity;
}

test('context carries the database, clock, and host it is given', async () => {
	const db = createMemoryDatabase();
	const clock = { now: () => 42 };
	const host = fakeHost();

	const ctx = await context({ db, clock, host, identity: fakeIdentity() });

	assert.equal(ctx.db, db);
	assert.equal(ctx.clock, clock);
	assert.equal(ctx.host, host);
});

// **Criterion 11.** Every request carries four ambient members, and the fourth is who is acting.
// *It said "there is no such request" as a request with no actor — that was #571's premise and
// requirement 7 deleted it. What survives is the shape: four members, always, and the fourth is
// either a person or plainly nobody.*
test('every request carries an identity, and it is one of the four members', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting()
	});

	assert.deepEqual(Object.keys(ctx).sort(), ['clock', 'db', 'host', 'identity']);
	assert.deepEqual(ctx.identity, {
		accountId: 'account',
		email: 'person@example.com',
		displayName: 'Person Example'
	});
});

test('an omitted clock defaults to the system clock', async () => {
	const before = Date.now();
	const ctx = await context({
		db: createMemoryDatabase(),
		host: fakeHost(),
		identity: fakeIdentity()
	});
	const now = ctx.clock.now();
	const after = Date.now();

	assert.equal(typeof now, 'number');
	assert.ok(now >= before && now <= after, 'clock.now() reports the current wall-clock time');
});

// **The acting user is who is signed in, not which folder is linked.** This is the read that
// changed: `workspace.accountId` has one writer in the tree — the Drive link — so resolving
// through it answered for a linked workspace and for nothing else. The fixture above leaves that
// field null, which is what an ordinary signed-in machine looks like.
test('a signed-in machine names its person, with no Drive folder in sight', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([
			fakeAccount({ id: 'account-9', email: 'her@example.com', displayName: 'Her Name' })
		])
	});

	assert.deepEqual(ctx.identity, {
		accountId: 'account-9',
		email: 'her@example.com',
		displayName: 'Her Name'
	});
});

// The clean install, from the API's side. **It used to be refused here and is answered here now**
// — the refusal moved to `procedure.member`, which is what forty-six of the fifty-one procedures use.
// What this pins is that the answer is `null` rather than an error and rather than a person.
test('a machine nobody has signed in on is answered with nobody', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([])
	});

	assert.equal(actor, null);
});

// Signing out keeps the account row so whatever was linked under it can say what it is waiting
// for, which means the row is present and the machine is not signed in. Reading the row rather
// than its status would hand a procedure somebody who has left.
test('a machine that signed out names nobody, row and all', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([fakeAccount({ status: 'needsReconnect', refreshTokenAvailable: false })])
	});

	assert.equal(actor, null);
});

// A shell that cannot answer and a machine nobody signed in on are the same situation to a
// procedure: there is no acting user either way. The two are deliberately not told apart —
// telling them apart would be a distinction no caller could act on differently.
test('a shell that cannot say who is acting names nobody', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: fakeHost()
	});

	assert.equal(actor, null);
});

// **The assertion decision 03 earns, and it matters more now than when the context refused.**
// That decision called a required identity with an anonymous placeholder the harder of the two
// failures. An absence that is expressible again is exactly the moment somebody fills it with a
// convenient object, so this pins that the answer is `null` and not a shape that could be mistaken
// for a person at a call site.
test('nobody is invented to fill the gap', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([])
	});

	assert.equal(actor, null, 'a machine with no account was given a stand-in actor');
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

// It used to be read by key, so a caller could ask for a request with no actor over a host that
// would have supplied one. There is no such request to ask for, so `undefined` means what every
// other member's does: resolve it.
test('an identity supplied as undefined falls back to the host rather than emptying the request', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting(),
		identity: undefined
	});

	assert.deepEqual(ctx.identity, {
		accountId: 'account',
		email: 'person@example.com',
		displayName: 'Person Example'
	});
});
