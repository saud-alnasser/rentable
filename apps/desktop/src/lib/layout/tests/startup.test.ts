import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from '$lib/api/context.ts';
import { caller, context, procedure, router } from '$lib/api/trpc.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import {
	fakeHeldOrganization,
	fakeHost,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import { maskOf } from '@rentable/workspace-permission';

import {
	A_DAY,
	AT,
	fakeRecovery,
	harness,
	locked,
	nowhereToGo,
	unlocked,
	withoutWorkspace
} from './testing.ts';

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
	assert.equal(startup.snapshot.remoteSync?.workspace.remoteId, 'first');
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
		remoteSync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'south' }) }),
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

// --- 3. A password that does not open the vault -----------------------------------------

test('a wrong password leaves the wall as it was, and says only that the value did not open', async () => {
	const { startup, journal } = harness({
		organization: locked(),
		signInWith: async () => {
			throw new Error('the sealed value did not open');
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'not the password');

	assert.equal(startup.snapshot.state, 'sign-in', 'the person is still standing at it');
	assert.equal(startup.snapshot.signInReason, 'locked');
	assert.equal(startup.snapshot.error, 'the sealed value did not open');
	assert.equal(startup.snapshot.isSigningIn, false);
	assert.equal(journal.bootstrapped, 0, 'nothing behind the wall ran');
});

// --- 4. A password that opens it, with and without a workspace to open --------------------

test('the right password goes straight on into the application, and the password is not held', async () => {
	const asked: [string, string][] = [];
	const { startup, journal } = harness({
		organization: locked(),
		signInWith: async (username, password) => {
			asked.push([username, password]);

			return { ...locked(), session: { ...withoutWorkspace().session!, workspaces: [] } };
		}
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'sign-in');

	// the shell is handed the password once; the snapshot never carries it.
	await startup.signIn('olivia', 'a long enough password');

	assert.deepEqual(asked, [['olivia', 'a long enough password']]);
	assert.ok(!JSON.stringify(startup.snapshot).includes('a long enough password'));
	// the context was built while nobody was signed in, so it belongs to nobody.
	assert.equal(journal.contextsForgotten, 1);
});

test('and a member admitted to an organization with no workspace yet is in, with nowhere to go', async () => {
	const { startup, journal } = harness({ organization: withoutWorkspace() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'no-workspace');
	// a person is in, so the rail is up; and nothing that needs a workspace ran.
	assert.equal(startup.snapshot.railIsUp, true);
	assert.deepEqual(journal.workspacesOpened, []);
	assert.equal(journal.bootstrapped, 0);
	assert.equal(journal.reconciled, 0);
	assert.equal(journal.shown, 1);
});

// the one this machine had open last is opened again where the session still holds it, and the
// first otherwise: a grant that was taken away is not reopened on the strength of a memory.
test('and the workspace opened is the one held last, where the session still holds a grant on it', async () => {
	const held = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [
				fakeOrganizationWorkspace({ id: 'north' }),
				fakeOrganizationWorkspace({ id: 'south', name: 'South' })
			]
		})
	});
	const remembered = harness({
		remoteSync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'south' }) }),
		organization: held
	});

	await remembered.startup.start();

	assert.deepEqual(remembered.journal.workspacesOpened, ['south']);

	const lost = harness({
		remoteSync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'gone' }) }),
		organization: held
	});

	await lost.startup.start();

	assert.deepEqual(lost.journal.workspacesOpened, ['north']);
});

test('and a member with a workspace reaches it after the sign-in, re-entering at the workspace stage', async () => {
	const asked: [string, string][] = [];
	const { startup, journal } = harness({
		organization: locked(),
		signInWith: async (username, password) => {
			asked.push([username, password]);

			return unlocked();
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'a long enough password');

	// the shell is handed both, once (effort 824, requirement 19).
	assert.deepEqual(asked, [['olivia', 'a long enough password']]);
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.isSigningIn, false);
	// re-entering at `workspace` is honest: those three stages are what this path has done.
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
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

// --- 7. A sign-out while the application is running ------------------------------------

test('signing out puts the wall back up, locked, and clears what was drawn for whoever left', async () => {
	const { startup, journal } = harness();

	await startup.start();
	assert.equal(startup.snapshot.state, 'ready');

	const clearedBefore = journal.cacheCleared;
	await startup.signOut();

	// locked rather than nowhere to go: the organization is still joined, and a password opens it.
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'locked');
	assert.equal(journal.cacheCleared, clearedBefore + 1, 'the workspace behind it is not readable');
	// the held context names an account this machine no longer has credentials for.
	assert.ok(journal.contextsForgotten > 0);
});

// requirement 20 of effort 824: the wall's disconnect forgets the organization on this machine,
// and the wall comes back as a machine that holds nothing. The confirm is the screen's; what the
// unit does is the call and the path after it.
test('disconnecting from the wall forgets the organization, and the wall comes back with nothing on it', async () => {
	const { startup, journal } = harness({ organization: locked() });

	await startup.start();
	assert.equal(startup.snapshot.signInReason, 'locked');

	const clearedBefore = journal.cacheCleared;
	await startup.disconnect();

	assert.equal(journal.disconnected, 1);
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noOrganization');
	assert.equal(startup.snapshot.organization?.organization, null);
	assert.equal(startup.snapshot.error, null);
	assert.equal(
		journal.cacheCleared,
		clearedBefore + 1,
		'nothing drawn for the organization survives'
	);
	// nothing behind the wall was opened on the way: no vault, so no workspace and no bootstrap.
	assert.deepEqual(journal.workspacesOpened, []);
	assert.equal(journal.bootstrapped, 0);
});

test('and a forget the shell refused leaves the wall as it was, with the sentence on it', async () => {
	const { startup, journal } = harness({
		organization: locked(),
		disconnect: async () => {
			throw new Error('a replica would not go');
		}
	});

	await startup.start();
	await startup.disconnect();

	assert.equal(journal.disconnected, 1);
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'locked', 'the organization is still held');
	assert.equal(startup.snapshot.error, 'a replica would not go');
});

// --- 8. The window close that syncs before it closes -----------------------------------

test('closing a running application pushes what it holds before the window goes', async () => {
	const { startup, journal } = harness();

	await startup.start();
	await startup.closeWindow();

	// hidden first, so a slow push looks like an application that closed rather than one that hung,
	// and closed last, because a window closed before the push is a push that never lands.
	assert.deepEqual(journal.sequence, ['hide', 'sync', 'close']);
});

test('and closing from any other state syncs nothing, because there is nothing behind it', async () => {
	const { startup, journal } = harness({ organization: locked() });

	await startup.start();
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.closesWithoutSyncing, true);

	await startup.closeWindow(startup.closesWithoutSyncing);

	assert.equal(journal.syncedBeforeExit, 0);
	assert.equal(journal.closed, 1);
});

test('and a second close request while one is in flight is ignored rather than doubled', async () => {
	const { startup, journal } = harness();

	await startup.start();
	await startup.closeWindow();
	await startup.closeWindow();

	assert.equal(journal.closed, 1);
});

// --- What the day and the network do to a running application ---------------------------

test('a day crossing recomputes what the date decides, and only once it has crossed', async () => {
	const { startup, journal, now } = harness();

	await startup.start();
	const reconciledOnStartup = journal.reconciled;

	await startup.reconcileOnDayCrossing();
	assert.equal(journal.reconciled, reconciledOnStartup, 'same day, nothing to do');

	now.value = AT + A_DAY;
	await startup.reconcileOnDayCrossing();

	assert.equal(journal.reconciled, reconciledOnStartup + 1);
});

test('and a pull that landed rows announces them, while one that landed none does not', async () => {
	const { startup, journal } = harness();

	await startup.start();

	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });
	assert.equal(journal.announced, 0, 'nothing arrived, so nothing to announce');

	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'north' });
	assert.equal(journal.announced, 1, 'rows arrived, and derived state has to be told');
});

// --- A change on another machine, after one heartbeat ---------------------------------------

/**
 * **Criterion 8 of effort 838, on this side of the boundary.** A role or an override changed on
 * another machine reaches an open session within one sync heartbeat: what the heartbeat reports is
 * applied here, and that is where the held API context is dropped and the organization read again.
 *
 * The context is a real one over a real caller, built the way `api/caller` builds it and dropped by
 * the port the application wires to `forgetContext`; the shell behind it is a fake whose state the
 * test moves, as another machine's write reaching the replica would.
 */
const heartbeatRouter = router({
	rename: procedure.permitted('renameWorkspace').query(() => 'renamed')
});

test('a member narrowed on another machine is refused on the next call after one heartbeat', async () => {
	const widened = fakeOrganizationState({
		session: fakeOrganizationSession({ permissions: maskOf('renameWorkspace') })
	});
	const narrowed = fakeOrganizationState({ session: fakeOrganizationSession({ permissions: 0 }) });
	let shell = widened;
	const host = fakeHost({
		organization: { ...fakeHost().organization, getState: async () => shell },
		remoteSync: {
			...fakeHost().remoteSync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) })
		}
	});
	let held: Promise<Context> | null = null;
	const api = caller(heartbeatRouter)(
		() => (held ??= context({ db: createMemoryDatabase(), clock: { now: () => AT }, host }))
	);
	const { startup, journal, standWith } = harness({
		organization: widened,
		forgetContext: () => {
			held = null;
		}
	});

	await startup.start();
	assert.equal(await api.rename(), 'renamed');

	// the narrowing lands on the replica; nothing on this machine has asked since.
	shell = narrowed;
	standWith(narrowed);

	const invalidatedBefore = journal.organizationInvalidated;
	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });

	const refusal = await api.rename().then(
		() => null,
		(error: unknown) => error as { code?: string }
	);

	assert.equal(refusal?.code, 'FORBIDDEN', 'the next call acted on what the member held before');
	assert.equal(startup.snapshot.organization?.session?.permissions, 0);
	assert.equal(journal.organizationInvalidated, invalidatedBefore + 1);

	// and the other way: widened again, the next heartbeat gives the act back.
	shell = widened;
	standWith(widened);
	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });

	assert.equal(await api.rename(), 'renamed');
});

// rows that land while a day-crossing pass is out are announced after it rather than dropped:
// that pass may have read the tables before they arrived, and nothing else refetches them.
test('and rows that land while a day-crossing reconcile is out are announced once it is back', async () => {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let holding = false;
	const { startup, journal, now } = harness({
		reconcile: async () => {
			// the day-crossing pass waits; the launch's own and what follows it do not.
			if (holding) {
				holding = false;
				await held;
			}
		}
	});

	await startup.start();

	now.value = AT + A_DAY;
	holding = true;
	const crossing = startup.reconcileOnDayCrossing();
	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'north' });
	assert.equal(journal.announced, 0, 'the pass is still out, so the rows wait');

	release();
	await crossing;

	assert.equal(journal.announced, 1, 'and are announced once it is back');
});

// --- A switch between workspaces, from inside the application -----------------------------

/** a member holding two workspaces, with the first one open. */
const holdingTwo = () =>
	harness({
		organization: fakeOrganizationState({
			session: fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south', name: 'South' })
				]
			})
		})
	});

test('switching workspaces drops what was drawn, opens the chosen one, and runs the stages to ready', async () => {
	const { startup, journal, seen } = holdingTwo();

	await startup.start();
	assert.deepEqual(journal.workspacesOpened, ['north']);

	const seenBefore = seen.length;
	const forgottenBefore = journal.contextsForgotten;
	await startup.switchWorkspace('south');

	// the loading surface went up first, and the application came back on the chosen workspace by
	// the three stages a sign-in runs past the wall.
	assert.equal(seen[seenBefore]?.state, 'loading');
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.error, null);
	assert.deepEqual(journal.workspacesOpened, ['north', 'south']);
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
	assert.equal(journal.bootstrapped, 2);
	assert.equal(journal.reconciled, 2);
	// nothing drawn from the workspace that was open survives: what the page drew is dropped, and
	// what the rail draws is refetched rather than removed from under it.
	assert.equal(journal.undrawnDropped, 1);
	assert.equal(journal.invalidatedAll, 1);
	// the rail reads the new workspace off its own query without waiting for a refetch.
	assert.equal(journal.remembered.at(-1)?.workspace.remoteId, 'south');
	assert.equal(startup.snapshot.remoteSync?.workspace.remoteId, 'south');
	// the member is who they were, and what they may do is not: the context is dropped once, since
	// a read-only grant on the workspace now open clears writes the one before allowed (effort 838).
	assert.equal(journal.contextsForgotten, forgottenBefore + 1);
});

test('and a workspace the shell would not open is the ordinary failure, with nothing dropped', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({
			session: fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south', name: 'South' })
				]
			})
		}),
		openWorkspace: async (workspaceId) => {
			if (workspaceId === 'south') {
				throw new Error('the replica would not open');
			}
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.error, 'the replica would not open');
	assert.deepEqual(journal.failures, ['the replica would not open']);
	assert.equal(journal.undrawnDropped, 0, 'what was drawn is still what is open');
	assert.equal(journal.bootstrapped, 1, 'nothing behind the open ran');
});

test('and a switch asked for while one is loading, or while a password is being tried, does nothing', async () => {
	const loading = holdingTwo();

	await loading.startup.start();

	// the second request lands while the first is still under the loading surface.
	const first = loading.startup.switchWorkspace('south');
	await loading.startup.switchWorkspace('north');
	await first;

	assert.deepEqual(loading.journal.workspacesOpened, ['north', 'south']);
	assert.equal(loading.startup.snapshot.state, 'ready');

	// and one that lands while a password is being derived is refused the same way.
	const signingIn: { harness: ReturnType<typeof harness> | null } = { harness: null };
	signingIn.harness = harness({
		organization: locked(),
		signInWith: async () => {
			await signingIn.harness?.startup.switchWorkspace('south');

			return unlocked();
		}
	});

	await signingIn.harness.startup.start();
	await signingIn.harness.startup.signIn('olivia', 'a long enough password');

	assert.deepEqual(signingIn.harness.journal.workspacesOpened, ['north']);
	assert.equal(signingIn.harness.startup.snapshot.state, 'ready');
});

// the card is still on screen while the workspace is being opened, which is a pull of the
// organization replica and an open of the workspace's own: a second submit in that window would
// derive a second key and run the way in twice, so the card stays closed until the loading
// surface is up.
test('and the card stays closed while the workspace the sign-in reached is being opened', async () => {
	const opening: { harness: ReturnType<typeof harness> | null; seen: boolean[] } = {
		harness: null,
		seen: []
	};
	opening.harness = harness({
		organization: locked(),
		openWorkspace: async () => {
			opening.seen.push(opening.harness?.startup.snapshot.isSigningIn ?? false);
			// a second submit lands while the open is out, and is refused.
			await opening.harness?.startup.signIn('olivia', 'a long enough password');
		}
	});

	await opening.harness.startup.start();
	await opening.harness.startup.signIn('olivia', 'a long enough password');

	assert.deepEqual(opening.seen, [true], 'the card was closed while the open was out');
	assert.deepEqual(opening.harness.journal.workspacesOpened, ['north'], 'and opened once');
	assert.equal(opening.harness.startup.snapshot.isSigningIn, false);
	assert.equal(opening.harness.startup.snapshot.state, 'ready');
});

// the plan's first technical risk: a dispatch in flight during the switch reports for the
// workspace it started on, after the application is up on the new one.
test('and a dispatch that reported for the workspace open before the switch is dropped whole', async () => {
	const { startup, journal } = holdingTwo();

	await startup.start();
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'ready');

	const before = { snapshot: startup.snapshot, journal: { ...journal } };
	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'north' });

	assert.equal(journal.announced, before.journal.announced, 'no rows were announced');
	assert.equal(journal.remoteSyncInvalidated, before.journal.remoteSyncInvalidated);
	assert.equal(journal.remembered.length, before.journal.remembered.length);
	assert.deepEqual(startup.snapshot, before.snapshot, 'and the reader saw nothing change');

	// while one for the workspace that is open now is applied as every outcome is.
	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'south' });

	assert.equal(journal.announced, before.journal.announced + 1);
});
