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

/** what `context()` does when it cannot name an acting user. */
async function refusalFrom(overrides: Parameters<typeof context>[0]) {
	return await context(overrides).then(
		() => null,
		(error: unknown) => error as { code?: string; message?: string }
	);
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

// **Criterion 11, and the test it replaces asserted the opposite.** That one was called *a local
// request carries exactly the three ambient members* and pinned a request with no acting user as
// the ordinary case. There is no such request: every one carries four.
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

// The clean install, from the API's side. #571 puts a screen in front of this so nobody reaches
// it by accident; the refusal is what makes that a guarantee rather than a convention.
test('a machine nobody has signed in on has no request to make', async () => {
	const refusal = await refusalFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([])
	});

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

// Signing out keeps the account row so whatever was linked under it can say what it is waiting
// for, which means the row is present and the machine is not signed in. Reading the row rather
// than its status would hand a procedure somebody who has left.
test('a machine that signed out is refused, row and all', async () => {
	const refusal = await refusalFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([fakeAccount({ status: 'needsReconnect', refreshTokenAvailable: false })])
	});

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

// A shell that cannot answer and a machine nobody signed in on are the same situation to a
// procedure: there is no acting user either way. The two are deliberately not told apart —
// telling them apart would be a distinction no caller could act on differently.
//
// This used to pass, producing a context with no actor. What makes the refusal affordable is that
// it is a rejected call rather than a failed import: the context is built on first use now, so a
// client that cannot answer fails its requests instead of failing to boot.
test('a shell that cannot say who is acting is refused rather than answered', async () => {
	const refusal = await refusalFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: fakeHost()
	});

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

// The refusal is a real person's absence, never a stand-in for one. Decision 03 called a required
// identity with an anonymous placeholder the harder of the two failures, and this is the assertion
// that the placeholder did not quietly arrive with the requirement.
test('nobody is invented to fill the gap', async () => {
	const refusal = await refusalFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting([])
	});

	assert.ok(refusal, 'a machine with no account produced a context');
	assert.ok(
		!/anonymous|guest|unknown user/i.test(refusal.message ?? ''),
		'the refusal named a stand-in user'
	);
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
