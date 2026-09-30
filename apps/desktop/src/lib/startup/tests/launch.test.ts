import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';

import { fakeRecovery, harness, locked, nowhereToGo } from './harness.ts';

/**
 * THE EIGHT PATHS
 *
 * Requirement 9 names them and says the order of the extraction is the requirement: the state
 * machine comes out as a unit that can be driven with no window, these become tests, and only
 * then does the rendering move. What each one used to cost was launching the application into a
 * state, and two of them needed a failing network or a half-finished update.
 *
 * Every port is a thing that is absent in this process. Nothing here mocks a module; the unit is
 * handed a window, an organization and a workspace, and a test says what each of them does.
 */

// --- 1. First launch, with no organization --------------------------------------------

test('a first launch with no organization stops at the wall, and opens nothing behind it', async () => {
	const { startup, journal } = harness({ organization: nowhereToGo() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noOrganization');
	// the rail is up: an application waiting for a person is an application that is running.
	assert.equal(startup.snapshot.railIsUp, true);
	assert.equal(journal.shown, 1, 'the window is shown, because there is something to answer');

	// requirement 3's ordering, as a property of this path rather than of a screen: the bootstrap
	// opens the database and the reconcile writes to it, and neither ran.
	assert.equal(journal.bootstrapped, 0);
	assert.equal(journal.reconciled, 0);
	assert.deepEqual(journal.stages, ['settings', 'account']);
});

// effort 824, requirement 3: the first run creates the organization and its first workspace on
// a route the wall let through, then tells the unit where the machine stands changed. The same
// read, admit, open and enter a sign-in runs past the wall, and it ends inside that workspace.
test('and the first run, once it has created the organization and a workspace, goes on in from where the machine now stands', async () => {
	const founded = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'first', name: 'First' })]
		}),
		holdsTursoAuthority: true
	});
	const { startup, journal, seen } = harness({
		organization: nowhereToGo(),
		afterBootstrap: founded
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'sign-in');

	const seenBefore = seen.length;
	await startup.standingChanged();

	// **the loading surface goes up first, before the standing is read.** The screen that called
	// this is still drawing its own form until something says otherwise, and reading the standing
	// reaches the shell: with the surface raised after that read, the walk sat there finished and
	// doing nothing for the whole round trip. The first thing anybody sees is `loading`, and
	// `ready` is where it ends.
	const after = seen.slice(seenBefore).map((snapshot) => snapshot.state);

	assert.equal(after[0], 'loading', 'the standing was read before the surface changed');
	assert.ok(after.indexOf('loading') < after.lastIndexOf('ready'));
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.error, null);
	assert.equal(startup.snapshot.railIsUp, true);
	assert.deepEqual(journal.workspacesOpened, ['first']);
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
	assert.equal(journal.bootstrapped, 1);
	assert.equal(journal.reconciled, 1);
	assert.equal(startup.snapshot.sync?.workspace.remoteId, 'first');
});

/**
 * Effort 832, requirement 18: **the first run is two steps and one loading pass.** The walk
 * creates the organization and hands the first workspace's creation to the unit as `prepare`. The
 * loading surface is what is up while it runs, as the pass's first stage, and what it made is read
 * with everything else: the pass goes on into that workspace.
 */
test('a prepare runs under the loading surface as the first stage, and the pass goes on into what it made', async () => {
	const founded = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'acme', name: 'Acme Rentals' })]
		}),
		holdsTursoAuthority: true
	});
	const { startup, journal, seen } = harness({
		organization: nowhereToGo(),
		afterBootstrap: founded
	});

	await startup.start();
	journal.stages.length = 0;

	const seenBefore = seen.length;
	const whilePreparing: { state: string; stages: string[] }[] = [];

	await startup.standingChanged({
		prepare: async () => {
			whilePreparing.push({ state: startup.snapshot.state, stages: [...journal.stages] });
		}
	});

	// the loading surface was already up when the prepare ran, and it was the pass's first stage:
	// nothing else was drawn between the walk and it.
	assert.deepEqual(whilePreparing, [{ state: 'loading', stages: ['prepare'] }]);
	assert.equal(seen[seenBefore]?.state, 'loading');
	assert.deepEqual(journal.stages, ['prepare', 'workspace', 'changes', 'records']);

	// one pass: loading, and then ready, with no other surface in between.
	assert.deepEqual(
		[...new Set(seen.slice(seenBefore).map((snapshot) => snapshot.state))],
		['loading', 'ready']
	);
	assert.deepEqual(journal.workspacesOpened, ['acme']);
	assert.equal(startup.snapshot.error, null);
});

// and a prepare that fails lands on the no-workspace surface, which already offers the create: the
// organization exists and the owner is in, so the pass reads where the machine stands anyway.
test('a prepare that fails lands on the no-workspace surface, with the owner in', async () => {
	const founded = fakeOrganizationState({
		session: fakeOrganizationSession({ workspaces: [] }),
		holdsTursoAuthority: true
	});
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		afterBootstrap: founded
	});

	await startup.start();

	await startup.standingChanged({
		prepare: async () => {
			throw new Error('turso could not be reached');
		}
	});

	assert.equal(startup.snapshot.state, 'no-workspace');
	assert.equal(startup.snapshot.railIsUp, true);
	assert.equal(startup.snapshot.organization?.session?.workspaces.length, 0);
	// said by the prepare's own handler, so the unit carries no error of its own for it, and it
	// is not a startup failure.
	assert.equal(startup.snapshot.error, null);
	assert.deepEqual(journal.failures, []);
	assert.deepEqual(journal.workspacesOpened, []);
	assert.equal(journal.bootstrapped, 0);
});

// effort 832, requirement 19: a join leaves the connect screen's address, and the move is waited
// for under the loading surface, as no stage of its own, before the standing is read. A pass that
// did not wait could end while the address was still the connect screen's, which opens signed out
// and would be drawn again over the finished pass.
test('an arrive runs under the loading surface with no stage of its own, before the standing is read', async () => {
	const joined = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'acme', name: 'Acme Rentals' })]
		})
	});
	const { startup, journal, seen } = harness({
		organization: nowhereToGo(),
		afterBootstrap: joined
	});

	await startup.start();
	journal.stages.length = 0;

	const seenBefore = seen.length;
	const whileArriving: { state: string; stages: string[]; read: boolean }[] = [];

	await startup.standingChanged({
		arrive: async () => {
			whileArriving.push({
				state: startup.snapshot.state,
				stages: [...journal.stages],
				read: startup.snapshot.organization?.session != null
			});
		}
	});

	// up under the loading surface, counted as nothing, and before the standing was read.
	assert.deepEqual(whileArriving, [{ state: 'loading', stages: [], read: false }]);
	assert.deepEqual(journal.stages, ['workspace', 'changes', 'records']);
	assert.deepEqual(
		[...new Set(seen.slice(seenBefore).map((snapshot) => snapshot.state))],
		['loading', 'ready']
	);
	assert.deepEqual(journal.workspacesOpened, ['acme']);
});

// and a move that fails is not a reason to stop: the standing is read, and the pass goes on.
test('an arrive that fails still reads the standing and goes on', async () => {
	const joined = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'acme', name: 'Acme Rentals' })]
		})
	});
	const { startup, journal } = harness({ organization: nowhereToGo(), afterBootstrap: joined });

	await startup.start();
	await startup.standingChanged({
		arrive: async () => {
			throw new Error('the navigation was cancelled');
		}
	});

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.error, null);
	assert.deepEqual(journal.workspacesOpened, ['acme']);
});

// effort 824, requirement 18: connecting by the organization's link records it on this machine
// with no member and opens no vault, and the route then tells the unit where the machine stands
// changed. What the unit reads is an organization held and nobody in, which is the wall, locked,
// naming that organization: the one a username and a password now open.
test('and a machine that connected by a link, holding the organization and no member, meets the wall locked', async () => {
	const connected = fakeOrganizationState({
		organization: fakeHeldOrganization({ id: 'acme', name: 'Acme', memberId: null, role: null }),
		session: null,
		holdsTursoAuthority: false
	});
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		afterBootstrap: connected
	});

	await startup.start();
	assert.equal(startup.snapshot.signInReason, 'noOrganization');

	await startup.standingChanged();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'locked');
	assert.equal(startup.snapshot.organization?.organization?.name, 'Acme');
	assert.equal(startup.snapshot.organization?.organization?.memberId, null);
	assert.equal(startup.snapshot.error, null);
	// nothing behind the wall was opened: no vault, so no workspace and no bootstrap.
	assert.deepEqual(journal.workspacesOpened, []);
	assert.equal(journal.bootstrapped, 0);
});

test('and the locale is loaded before the wall, so the wall is readable', async () => {
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		settings: async () => ({ locale: 'ar' })
	});

	await startup.start();

	assert.equal(journal.localeSet, 'ar', 'the reader own locale, set first');
	assert.deepEqual(journal.localesLoaded, ['ar', 'en'], 'and the rest after it');
});

// the window is created hidden, so the reader's appearance drawn before the first showing is
// what keeps a frame from painting in the wrong one (effort 832, requirement 2).
test('and the stored appearance is applied before the window is shown', async () => {
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		settings: async () => ({ locale: 'en', appearance: 'light' })
	});

	await startup.start();

	assert.equal(journal.appearance, 'light');
	assert.ok(journal.shown > 0, 'the wall was shown');
	assert.ok(
		journal.shownIn.every((appearance) => appearance === 'light'),
		`shown in ${journal.shownIn.join(', ')}`
	);
});

test('a settings file with no appearance is shown following the system', async () => {
	const { startup, journal } = harness({ settings: async () => ({ locale: 'en' }) });

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');
	assert.deepEqual(journal.shownIn, ['system']);
});

// --- 2. Launch already signed in -------------------------------------------------------

test('a launch on a signed-in machine reaches the application', async () => {
	const { startup, journal } = harness();

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.railIsUp, true);
	assert.equal(startup.snapshot.error, null);
	// the workspace the session holds is opened before the bootstrap, which then finds it named.
	assert.deepEqual(journal.workspacesOpened, ['north']);
	assert.equal(journal.bootstrapped, 1);
	assert.equal(journal.synced, 1);
	assert.equal(journal.reconciled, 1);
	assert.equal(journal.shown, 1);
});

// effort 826, requirement 12: the machine stayed signed in, so the first `getState` of the launch
// already carries a session and the wall is never drawn at all. What the person sees is the
// loading surface and then the workspace they had open last.
test('a machine that stayed signed in opens its last workspace and never shows the wall', async () => {
	const held = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [
				fakeOrganizationWorkspace({ id: 'north' }),
				fakeOrganizationWorkspace({ id: 'south', name: 'South' })
			]
		})
	});
	const { startup, journal, seen } = harness({
		sync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'south' }) }),
		organization: held
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');
	assert.deepEqual(journal.workspacesOpened, ['south']);
	assert.ok(
		seen.every((snapshot) => snapshot.state !== 'sign-in'),
		'the wall was drawn on the way in'
	);

	// and signing out ends it: the next launch of the same machine stands at the wall, on the
	// organization it still holds, because the key that opened the vault went with the sign-out.
	await startup.signOut();
	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'locked');
	assert.deepEqual(journal.workspacesOpened, ['south'], 'a workspace opened after the sign-out');
});

// requirement 16, from the side the loading screen reads. Every stage is an await this path
// performs, in the order it performs them, and the last is timed by finishing.
test('and reports every stage it passes, in order, and says when it is done', async () => {
	const { startup, journal } = harness();

	await startup.start();

	assert.deepEqual(journal.stages, ['settings', 'account', 'workspace', 'changes', 'records']);
	assert.equal(journal.completed, 1);
});

// the bootstrap can change the answer: what it opens is read back afterwards, and a member whose
// place changed under them while it ran meets the wall. Admitting only before it would carry on
// into a database that is nobody's.
test('and a machine the bootstrap turns out of the organization meets the wall after it', async () => {
	const { startup, journal } = harness({ afterBootstrap: locked() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(journal.bootstrapped, 1, 'the bootstrap ran');
	assert.equal(journal.reconciled, 0, 'and nothing after it did');
});

// effort 826, requirement 22: a session ended from another machine while this one was closed
// is learned at the launch's own pull, and the launch ends at the wall rather than on a
// workspace nobody is signed in to.
test('and a session ended elsewhere, learned at the pull the launch makes, ends the launch at the wall', async () => {
	const { startup, journal } = harness();

	journal.standing = 'signedOutElsewhere';

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(journal.synced, 1, 'the pull ran');
	assert.equal(journal.reconciled, 0, 'and nothing after it did');
});

// --- 5. A pending recovery -------------------------------------------------------------

test('a pending recovery stops startup and shows what is waiting', async () => {
	const recovery = fakeRecovery({ status: 'pending', targetVersion: '0.14.0' });
	const { startup, journal } = harness({ bootstrap: async () => recovery });

	await startup.start();

	assert.equal(startup.snapshot.state, 'recovery');
	assert.deepEqual(startup.snapshot.recovery, recovery);
	assert.equal(journal.shown, 1);
	assert.equal(journal.reconciled, 0, 'nothing behind the recovery screen ran');
	// the bare frame, not the rail: this is a state where the application stopped.
	assert.equal(startup.snapshot.railIsUp, false);
});

test('and a recovery record with nothing in it is no recovery at all', async () => {
	const { startup } = harness({ bootstrap: async () => fakeRecovery({ status: 'pending' }) });

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.recovery, null);
});

// --- 6. A startup that throws, and is retried ------------------------------------------

test('a startup that throws reports the failure and writes it down', async () => {
	const { startup, journal } = harness({
		bootstrap: async () => {
			throw new Error('the workspace would not open');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.error, 'the workspace would not open');
	// the failure screen refuses the message and offers the diagnostics folder, which is only an
	// honest offer if the failure is in there.
	assert.deepEqual(journal.failures, ['the workspace would not open']);
	assert.equal(journal.shown, 1);
});

test('and retrying it runs the whole path again, from the first stage', async () => {
	let attempts = 0;
	const { startup, journal } = harness({
		bootstrap: async () => {
			attempts += 1;

			if (attempts === 1) {
				throw new Error('not this time');
			}

			return fakeRecovery();
		}
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'error');

	await startup.retry();

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.error, null);
	assert.deepEqual(journal.stages.slice(0, 2), ['settings', 'account'], 'from the top');
});
