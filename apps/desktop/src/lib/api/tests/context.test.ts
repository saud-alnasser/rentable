import assert from 'node:assert/strict';
import test from 'node:test';

import type { Host, OrganizationSession } from '$lib/platform/host.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeIdentity } from '$lib/api/tests/testing.ts';
import {
	fakeHost,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import {
	BUILT_IN,
	WRITE_FLAGS,
	effectiveIn,
	maskOf,
	permits
} from '@rentable/workspace-permission';

import { context } from '../context.ts';

// a shell reporting whose vault is open on this machine, or nobody's.
//
// The state is written out in full by the fixtures behind it. *It used to report a Google account
// off the sync state; the wall admits on the organization state now, and this is the same read,
// so a context reading the old field would fail every test below rather than pass them.*
function shellReporting(session: OrganizationSession | null = fakeOrganizationSession()) {
	const state = fakeOrganizationState({ session });

	return fakeHost({
		organization: {
			...fakeHost().organization,
			getState: async () => state
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
		accountId: 'member-owner',
		username: 'person.example',
		permissions: 0
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

// **The acting user is whose vault is open**, which is the read the wall admits on. The member's
// id stands where an account id stood, because a member is what an account became.
test('a signed-in machine names its member, off the organization state', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting(
			fakeOrganizationSession({
				memberId: 'member-9',
				username: 'her.name'
			})
		)
	});

	assert.deepEqual(ctx.identity, {
		accountId: 'member-9',
		username: 'her.name',
		permissions: 0
	});
});

// The clean install, from the API's side. **It used to be refused here and is answered here now**
// — the refusal moved to `procedure.member`, which is what forty-six of the fifty-one procedures use.
// What this pins is that the answer is `null` rather than an error and rather than a person.
test('a machine nobody has signed in on is answered with nobody', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting(null)
	});

	assert.equal(actor, null);
});

// Signing out keeps the organization joined so the wall can list it, which means the machine
// still knows the member and is not signed in. Reading what the machine remembers rather than
// whose vault is open would hand a procedure somebody who has left.
test('a machine that signed out names nobody, joined organization and all', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellReporting(null)
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
		host: shellReporting(null)
	});

	assert.equal(actor, null, 'a machine with no account was given a stand-in actor');
});

test('a supplied identity is carried as given, like every other member', async () => {
	const identity = {
		accountId: 'account-2',
		username: 'other',
		permissions: 0
	};
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
		accountId: 'member-owner',
		username: 'person.example',
		permissions: 0
	});
});

/**
 * **What this member may do comes off their verified row on the same answer**, which the session
 * carries: `actingIdentity` is handed the whole state, and the permissions are on it.
 *
 * The number is deliberately not `0` here. Every other test in this file resolves against a
 * member who administers nothing, so a context that dropped the field entirely would agree with
 * all of them.
 */
test('who is acting carries what they may do, off the same answer', async () => {
	const host = shellReporting(
		fakeOrganizationSession({ permissions: maskOf('renameWorkspace', 'inviteMember') })
	);

	const actor = await actorFrom({ db: createMemoryDatabase(), clock: { now: () => 0 }, host });

	assert.equal(actor?.permissions, maskOf('renameWorkspace', 'inviteMember'));
	assert.ok(permits(actor?.permissions ?? 0, 'renameWorkspace'));
	assert.ok(!permits(actor?.permissions ?? 0, 'removeMember'), 'an act nobody granted was carried');
});

/**
 * **A machine that reaches no shell carries nobody at all**, so there is no identity for a number
 * to sit on — which is the safe direction, and the one a `permitted` procedure refuses on.
 */
test('a shell that cannot be reached carries no permissions because it carries nobody', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: fakeHost()
	});

	assert.equal(actor, null);
});

/**
 * **What a member may do in the workspace open is their permissions with a read-only grant's
 * writes cleared** (effort 838, requirement 10, criterion 10). The session carries what they may
 * do across the organization; the context folds it for the workspace this machine has open.
 */
function shellOpenOn(workspaceId: string | null, session: OrganizationSession): Host {
	const state = fakeOrganizationState({ session });

	return fakeHost({
		organization: { ...fakeHost().organization, getState: async () => state },
		remoteSync: {
			...fakeHost().remoteSync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: workspaceId }) })
		}
	});
}

/** a manager holding north read-only and south with full access. */
const managerOnTwo = () =>
	fakeOrganizationSession({
		role: 'manager',
		roleId: BUILT_IN.manager.id,
		rank: BUILT_IN.manager.rank,
		permissions: BUILT_IN.manager.mask,
		workspaces: [
			fakeOrganizationWorkspace({ id: 'north', accessLevel: 'read-only' }),
			fakeOrganizationWorkspace({ id: 'south', accessLevel: 'full-access' })
		]
	});

test('on a read-only grant every write flag is clear, whatever the role says', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellOpenOn('north', managerOnTwo())
	});
	const permissions = actor?.permissions ?? 0;

	for (const flag of WRITE_FLAGS) {
		assert.ok(!permits(permissions, flag), `${flag} was held on a read-only grant`);
	}

	assert.equal(permissions, effectiveIn(BUILT_IN.manager.mask, 'read-only'));
	// what the grant does not narrow stays: the organization's flags, and reading records.
	assert.ok(permits(permissions, 'assignRole'));
	assert.ok(permits(permissions, 'viewPayment'));
});

test('on a full-access grant the writes the role carries are held', async () => {
	const actor = await actorFrom({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host: shellOpenOn('south', managerOnTwo())
	});

	assert.equal(actor?.permissions, BUILT_IN.manager.mask);
	assert.ok(permits(actor?.permissions ?? 0, 'deletePayment'));
});

// the safe direction: a machine with nothing open, or open on a workspace the session holds no
// grant on, writes no records, and its organization flags are untouched.
test('where the open workspace cannot be said, the writes are cleared and nothing else is', async () => {
	for (const open of [null, 'elsewhere']) {
		const actor = await actorFrom({
			db: createMemoryDatabase(),
			clock: { now: () => 0 },
			host: shellOpenOn(open, managerOnTwo())
		});

		assert.equal(actor?.permissions, effectiveIn(BUILT_IN.manager.mask, 'read-only'), `${open}`);
	}
});
