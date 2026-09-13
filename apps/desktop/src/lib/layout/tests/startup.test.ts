import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';

import {
	A_DAY,
	AT,
	fakeRecovery,
	harness,
	locked,
	mustChangePassword,
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

	// the loading surface went up, the one workspace was opened, and the stages ran to ready.
	assert.ok(seen.slice(seenBefore).some((snapshot) => snapshot.state === 'loading'));
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.error, null);
	assert.equal(startup.snapshot.railIsUp, true);
	assert.deepEqual(journal.workspacesOpened, ['first']);
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
	assert.equal(journal.bootstrapped, 1);
	assert.equal(journal.reconciled, 1);
	assert.equal(startup.snapshot.remoteSync?.workspace.remoteId, 'first');
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

// --- 3. A password that does not open the vault -----------------------------------------

test('a wrong password leaves the wall as it was, and says only that the value did not open', async () => {
	const { startup, journal } = harness({
		organization: locked(),
		signInWith: async () => {
			throw new Error('the sealed value did not open');
		}
	});

	await startup.start();
	await startup.signIn('acme', 'not the password');

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
		signInWith: async (organizationId, password) => {
			asked.push([organizationId, password]);

			return { ...locked(), session: { ...withoutWorkspace().session!, workspaces: [] } };
		}
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'sign-in');

	// the shell is handed the password once; the snapshot never carries it.
	await startup.signIn('acme', 'a long enough password');

	assert.deepEqual(asked, [['acme', 'a long enough password']]);
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
	const { startup, journal } = harness({ organization: locked() });

	await startup.start();
	await startup.signIn('acme', 'a long enough password');

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.isSigningIn, false);
	// re-entering at `workspace` is honest: those three stages are what this path has done.
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
});

// --- 4b. Joining by a link, which is a sign-in with a step before it and one after ---------

test('a link and the generated password join, on a machine that had joined nothing, and stop at the password', async () => {
	const asked: [string, string][] = [];
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		joinWith: async (link, password) => {
			asked.push([link, password]);

			// what joining leaves the machine in: the organization recorded, and the member in,
			// holding the workspace they were invited into.
			return {
				organization: { id: 'acme', name: 'Acme', memberId: 'sami', role: 'member', joinedAt: 1 },
				session: fakeOrganizationSession({
					mustChangePassword: true,
					workspaces: [fakeOrganizationWorkspace({ id: 'north' })]
				}),
				holdsTursoAuthority: false
			};
		},
		changePasswordWith: async () => ({
			organization: { id: 'acme', name: 'Acme', memberId: 'sami', role: 'member', joinedAt: 1 },
			session: fakeOrganizationSession({
				mustChangePassword: false,
				workspaces: [fakeOrganizationWorkspace({ id: 'north' })]
			}),
			holdsTursoAuthority: false
		})
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noOrganization');

	const joined = await startup.joinByLink('rentable://join/abc', 'abcde-fghjk-mnpqr-stuvw');

	assert.equal(joined, true);
	assert.deepEqual(asked, [['rentable://join/abc', 'abcde-fghjk-mnpqr-stuvw']]);
	assert.ok(!JSON.stringify(startup.snapshot).includes('abcde-fghjk'));
	// in, on the password somebody else drew: the next screen is choosing their own, and the
	// workspace they were granted opens after that and not before.
	assert.equal(startup.snapshot.state, 'change-password');
	assert.equal(startup.snapshot.organization?.organization?.name, 'Acme');
	assert.deepEqual(journal.workspacesOpened, []);
	assert.equal(journal.contextsForgotten, 1);

	await startup.changePassword('abcde-fghjk-mnpqr-stuvw', 'a password of my own');

	assert.equal(startup.snapshot.state, 'ready');
	assert.deepEqual(journal.workspacesOpened, ['north']);
});

test('and a refused invitation leaves the person at the join screen with the sentence', async () => {
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		joinWith: async () => {
			throw new Error('the invitation to Acme has lapsed; ask whoever invited you for a new one');
		}
	});

	await startup.start();

	const joined = await startup.joinByLink('rentable://join/abc', 'abcde-fghjk-mnpqr-stuvw');

	assert.equal(joined, false);
	assert.equal(startup.snapshot.state, 'sign-in', 'still standing at the wall');
	assert.equal(
		startup.snapshot.error,
		'the invitation to Acme has lapsed; ask whoever invited you for a new one'
	);
	assert.equal(startup.snapshot.isSigningIn, false);
	assert.equal(journal.bootstrapped, 0);
});

// requirement 6: the organization's own link and the password restore a place on a machine
// that had joined nothing, and the owner arrives holding no Turso authority.
test("the organization's own link and the password restore an owner, who then holds no authority", async () => {
	const asked: [string, string, string][] = [];
	const { startup, journal } = harness({
		organization: nowhereToGo(),
		restoreWith: async (link, email, password) => {
			asked.push([link, email, password]);

			return {
				organization: { id: 'acme', name: 'Acme', memberId: 'olivia', role: 'owner', joinedAt: 1 },
				session: fakeOrganizationSession({
					role: 'owner',
					workspaces: [fakeOrganizationWorkspace({ id: 'north' })]
				}),
				holdsTursoAuthority: false
			};
		}
	});

	await startup.start();

	const restored = await startup.restoreByLink('rentable://join/abc', '', 'the owners password');

	assert.equal(restored, true);
	assert.deepEqual(asked, [['rentable://join/abc', '', 'the owners password']]);
	assert.ok(!JSON.stringify(startup.snapshot).includes('the owners password'));
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.organization?.holdsTursoAuthority, false);
	assert.deepEqual(journal.workspacesOpened, ['north']);
});

// --- 4c. A password somebody else drew ----------------------------------------------------

test('a member on a handed password is asked to choose their own, and reaches nothing else', async () => {
	const { startup, journal } = harness({ organization: mustChangePassword() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'change-password');
	assert.equal(startup.snapshot.railIsUp, true, 'a person is in');
	assert.deepEqual(journal.workspacesOpened, [], 'no workspace was opened for them');
	assert.equal(journal.bootstrapped, 0);
	assert.equal(journal.shown, 1);
});

test('and choosing one goes on into the application, with neither password held', async () => {
	const asked: [string, string][] = [];
	const { startup, journal } = harness({
		organization: mustChangePassword(),
		changePasswordWith: async (current, next) => {
			asked.push([current, next]);

			return unlocked();
		}
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'change-password');

	const changed = await startup.changePassword('abcde-fghjk-mnpqr-stuvw', 'a password of my own');

	assert.equal(changed, true);
	assert.deepEqual(asked, [['abcde-fghjk-mnpqr-stuvw', 'a password of my own']]);
	assert.ok(!JSON.stringify(startup.snapshot).includes('abcde-fghjk'));
	assert.ok(!JSON.stringify(startup.snapshot).includes('a password of my own'));
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(journal.bootstrapped, 1);
});

test('and a refused change leaves the person at the screen with the sentence', async () => {
	const { startup, journal } = harness({
		organization: mustChangePassword(),
		changePasswordWith: async () => {
			throw new Error('the sealed value did not open');
		}
	});

	await startup.start();

	const changed = await startup.changePassword('not the password', 'a password of my own');

	assert.equal(changed, false);
	assert.equal(startup.snapshot.state, 'change-password');
	assert.equal(startup.snapshot.error, 'the sealed value did not open');
	assert.equal(startup.snapshot.isSigningIn, false);
	assert.equal(journal.bootstrapped, 0);
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
	// the member and the database proxy are what they were, so the session is not remembered again.
	assert.equal(journal.contextsForgotten, forgottenBefore);
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
	await signingIn.harness.startup.signIn('acme', 'a long enough password');

	assert.deepEqual(signingIn.harness.journal.workspacesOpened, ['north']);
	assert.equal(signingIn.harness.startup.snapshot.state, 'ready');
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
