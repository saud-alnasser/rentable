import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeHost, fakeSyncState } from '$lib/platform/tests/testing.ts';
import { appRouter } from '../router.ts';
import { caller, context } from '../trpc.ts';

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
