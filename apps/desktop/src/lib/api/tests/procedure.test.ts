import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMINISTRATION_BY_ROLE, maskOf } from '@rentable/workspace-permission';

import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import type { Host, RemoteSyncState } from '$lib/platform/host.ts';
import {
	fakeAccount,
	fakeHost,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import { appRouter } from '../router.ts';
import { caller, context, procedure, router } from '../trpc.ts';
import { fakeIdentity, NOW } from './testing.ts';

/**
 * WHO MAY CALL WHAT
 *
 * **The line requirement 3 used to hold by ordering, held by the boundary instead.** Nothing opens
 * or writes the workspace before there is an account. That was true because `context()` refused a
 * machine with nobody signed in; requirement 9a needed the settings page to work on exactly such a
 * machine, so the refusal moved to `procedure.member` and these are the tests that it still bites.
 *
 * A signed-out caller is a real context — the same one the application builds — with no identity in
 * it, which is what a clean install produces on its own.
 */
async function signedOutApi() {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		// the default fake refuses by name anything a test did not ask for, which is what makes a
		// procedure reaching past its own capability visible. These three are what the public
		// procedures read, and nothing here supplies a database read for them to fall back on.
		host: fakeHost({
			update: {
				prepare: async () => {
					throw new Error('not asked for');
				},
				check: async () => null
			},
			remoteSync: {
				getState: async () => fakeSyncState({ accounts: [] }),
				renewSession: async () => fakeSyncState({ accounts: [] }),
				establishSession: async () => fakeSyncState({ accounts: [] }),
				replicate: async () => ({ pushed: false, received: false }),
				push: async () => false,
				renameWorkspace: async () => fakeSyncState({ accounts: [] })
			}
		}),
		identity: null
	});

	assert.equal(ctx.identity, null, 'the fixture was signed in');

	return caller(appRouter)(ctx);
}

async function refusalFrom(call: Promise<unknown>) {
	return await call.then(
		() => null,
		(error: unknown) => error as { code?: string }
	);
}

test('a procedure that reaches the workspace refuses a machine nobody has signed in on', async () => {
	const api = await signedOutApi();

	const refusal = await refusalFrom(api.tenant.search({ term: '' }));

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

// A read is not exempt, and this is the one people get wrong: a list looks harmless and the
// workspace it lists belongs to somebody.
test('reading is refused as firmly as writing', async () => {
	const api = await signedOutApi();

	const listing = await refusalFrom(api.complex.search({ term: '' }));
	const writing = await refusalFrom(api.complex.create({ name: 'somewhere', location: 'nowhere' }));

	assert.equal(listing?.code, 'UNAUTHORIZED');
	assert.equal(writing?.code, 'UNAUTHORIZED');
});

// Requirement 3's ordering, as a property of the boundary. The bootstrap is what opens the
// database, so it is the single call that most has to be behind this.
test('the bootstrap is behind the same refusal', async () => {
	const api = await signedOutApi();

	const refusal = await refusalFrom(api.app.bootstrap());

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

// **Requirement 9a.** The settings page reads and writes through these two and nothing else, and
// the account row on the signed-out rail offers that page.
test('this machine reads and writes its own settings with nobody signed in', async () => {
	const api = await signedOutApi();

	const settings = await api.app.settings.get();

	assert.ok(settings, 'the settings page could not read its settings');

	const changed = await api.app.settings.set({ endingSoonNoticeDays: 45 });

	assert.ok(changed, 'the settings page could not write its settings');
});

// The updates group on the same page. Updating is this installation's business rather than an
// account's, and the page is one screen.
test('the updater answers a machine nobody has signed in on', async () => {
	const api = await signedOutApi();

	await api.app.update.check();
});

// The one public procedure that is not on the settings page. It reads the shell's own record of
// what this machine has synced — including whether anybody is signed in — so requiring an acting
// user would make it answerable only where the answer is already known.
test('what the shell knows about syncing is readable either way', async () => {
	const api = await signedOutApi();

	await api.app.remoteSync.getState();
});

// **And the one beside it that is not.** Reading what this machine has synced is a fact about the
// machine; renaming the workspace is a write against a row the control plane guards with a
// permission, so it needs an acting user however small the change looks. The fake host refuses
// `remoteSync.renameWorkspace` by name, so a procedure that let this through would fail with that
// refusal rather than this one, which is what makes the assertion say something.
test('renaming the workspace is not, however small the write looks', async () => {
	const api = await signedOutApi();

	const refusal = await refusalFrom(api.app.remoteSync.rename({ name: 'somewhere else' }));

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

/**
 * WHAT A PERMITTED PROCEDURE REFUSES
 *
 * **A router of its own rather than one of the application's**, because no procedure in the
 * application is `permitted` yet — the rename becomes one in #716, and until then the mechanism
 * has no caller. What is under test is `procedure.permitted`, so the honest subject is the
 * smallest router that uses it: a real caller, a real context, the real middleware chain, and one
 * procedure that does nothing but answer.
 *
 * *A test that waited for the rename would be testing the rename.*
 */
const permittedRouter = router({
	rename: procedure.permitted('renameWorkspace').query(() => 'renamed'),
	// two acts, so *some of them* is a case that exists.
	both: procedure.permitted('renameWorkspace', 'inviteMember').query(() => 'both'),
	// beside them, so a refusal can be shown to be about the permission rather than about the
	// caller: the same context reaches this one.
	anybody: procedure.member.query(() => 'anybody')
});

/**
 * A shell answering with one state, and refusing everything else by name.
 *
 * `Host['remoteSync']` is a whole object, so an override supplies all of it or none — a partial
 * would not type-check. Written once here rather than twice below.
 */
function shellAnswering(state: RemoteSyncState): Host {
	return fakeHost({
		remoteSync: {
			getState: async () => state,
			renewSession: async () => state,
			establishSession: async () => state,
			replicate: async () => ({ pushed: false, received: false }),
			push: async () => false,
			renameWorkspace: async () => state
		}
	});
}

async function apiFor(permissions: number) {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => NOW },
		host: fakeHost(),
		identity: fakeIdentity({ permissions })
	});

	return caller(permittedRouter)(ctx);
}

test('a member the workspace permits to take an act reaches the procedure that names it', async () => {
	const api = await apiFor(maskOf('renameWorkspace'));

	assert.equal(await api.rename(), 'renamed');
});

test('and one whose membership does not carry it is refused', async () => {
	const api = await apiFor(ADMINISTRATION_BY_ROLE.member);

	const refusal = await refusalFrom(api.rename());

	assert.equal(refusal?.code, 'FORBIDDEN');

	// **The refusal is about the permission and not about the caller.** The same context reaches a
	// plain member procedure, so a `permitted` procedure that had refused everybody would pass the
	// assertion above and fail this one.
	assert.equal(await api.anybody(), 'anybody');
});

// The flag alone decides it. Nothing about the identity moves between these two.
test('granting the act is the whole of what changes the answer', async () => {
	const without = await apiFor(0);
	const with_ = await apiFor(maskOf('renameWorkspace'));

	assert.equal((await refusalFrom(without.rename()))?.code, 'FORBIDDEN');
	assert.equal(await with_.rename(), 'renamed');
});

/**
 * **Every act, not any of them.** A procedure that names two is a procedure that does two things,
 * and a caller holding one of them cannot do it.
 */
test('a caller holding some of a set of acts is refused for the set', async () => {
	const api = await apiFor(maskOf('renameWorkspace'));

	assert.equal(await api.rename(), 'renamed', 'the one act it does hold was refused');
	assert.equal((await refusalFrom(api.both()))?.code, 'FORBIDDEN');

	const holdingBoth = await apiFor(maskOf('renameWorkspace', 'inviteMember'));

	assert.equal(await holdingBoth.both(), 'both');
});

/**
 * **A machine nobody is signed in on is refused before the permission is consulted.** The two
 * refusals say different things and a client can act on the difference: one is settled by signing
 * in, and the other is not settled by anything the person holding the machine can do.
 */
test('a signed-out caller is unauthorized rather than forbidden', async () => {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => NOW },
		host: shellAnswering(fakeSyncState({ accounts: [] })),
		identity: null
	});

	const refusal = await refusalFrom(caller(permittedRouter)(ctx).rename());

	assert.equal(refusal?.code, 'UNAUTHORIZED');
});

/**
 * **What the shell said is what the procedure asks about**, which is the half a supplied identity
 * cannot show: every test above hands `context()` an identity outright, so none of them proves
 * that a resolved one carries the permissions the control plane sent.
 *
 * This one lets the context resolve it off a fake host, the way the application does.
 */
test('the permissions a procedure reads are the ones the shell answered with', async () => {
	const signedIn = fakeAccount();
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => NOW },
		host: shellAnswering(
			fakeSyncState({
				accounts: [signedIn],
				workspace: fakeWorkspace({ permissions: maskOf('renameWorkspace') })
			})
		)
	});

	assert.equal(ctx.identity?.permissions, maskOf('renameWorkspace'));
	assert.equal(await caller(permittedRouter)(ctx).rename(), 'renamed');
});
