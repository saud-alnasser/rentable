import assert from 'node:assert/strict';
import test from 'node:test';

import {
	A_DAY,
	AT,
	fakeRecovery,
	harness,
	signedIn,
	signedOut,
	withoutSession
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
 * handed a window, a control plane and a workspace, and a test says what each of them does.
 */

// --- 1. First launch, with no account -------------------------------------------------

test('a first launch with no account stops at the wall, and opens nothing behind it', async () => {
	const { startup, journal } = harness({ remoteSync: signedOut() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noAccount');
	// the rail is up: an application waiting for a person is an application that is running.
	assert.equal(startup.snapshot.railIsUp, true);
	assert.equal(journal.shown, 1, 'the window is shown, because there is something to answer');

	// requirement 3's ordering, as a property of this path rather than of a screen: the bootstrap
	// opens the database and the reconcile writes to it, and neither ran.
	assert.equal(journal.bootstrapped, 0);
	assert.equal(journal.reconciled, 0);
	assert.deepEqual(journal.stages, ['settings', 'account']);
});

test('and the locale is loaded before the wall, so the wall is readable', async () => {
	const { startup, journal } = harness({
		remoteSync: signedOut(),
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

// the bootstrap can change the answer: minting is what learns this account is no longer a member
// of the workspace this machine held. Admitting only before it would carry on into a database
// that is nobody's.
test('and a machine the bootstrap turns out of the workspace meets the wall after it', async () => {
	const { startup, journal } = harness({ afterBootstrap: signedOut() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(journal.bootstrapped, 1, 'the bootstrap ran');
	assert.equal(journal.reconciled, 0, 'and nothing after it did');
});

// --- 3. A sign-in that fails at the consent screen -------------------------------------

test('abandoning the consent screen leaves the wall as it was, and says nothing', async () => {
	const { startup } = harness({
		remoteSync: signedOut(),
		signInWith: async () => {
			throw new Error('user cancelled');
		},
		isCancellation: () => true
	});

	await startup.start();
	await startup.signIn();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.error, null, 'an answer, not a failure');
	assert.equal(startup.snapshot.isSigningIn, false);
	assert.equal(startup.snapshot.signInPhase, null);
});

test('and a consent screen that actually fails says so on the wall rather than on an error screen', async () => {
	const { startup } = harness({
		remoteSync: signedOut(),
		signInWith: async () => {
			throw new Error('google said no');
		}
	});

	await startup.start();
	await startup.signIn();

	assert.equal(startup.snapshot.state, 'sign-in', 'the person is still standing at it');
	assert.equal(startup.snapshot.error, 'google said no');
});

// --- 4. Signed in, and no control plane reached ----------------------------------------

test('a sign-in that reaches no control plane holds an identity and no session', async () => {
	const { startup, journal } = harness({
		remoteSync: signedOut(),
		signInWith: async () => withoutSession()
	});

	await startup.start();
	await startup.signIn();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noSession', 'not noAccount, and not windowClosed');
	assert.equal(startup.snapshot.error, null, 'the wall says it, so nothing is written here');
	assert.equal(journal.bootstrapped, 0);
	// the context was built while nobody was signed in, so it belongs to nobody.
	assert.equal(journal.contextsForgotten, 1);
});

test('and the retry repeats that one call, opening no browser, and goes on when it works', async () => {
	let established = 0;
	const { startup, journal } = harness({
		remoteSync: signedOut(),
		signInWith: async () => withoutSession(),
		establishSession: async () => {
			established += 1;

			return signedIn();
		}
	});

	await startup.start();
	await startup.signIn();
	await startup.retrySession();

	assert.equal(established, 1);
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.isRetryingSession, false);
	// re-entering at `workspace` is honest: those three stages are what this path has done.
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
});

test('and being unreachable again leaves the wall exactly where it was', async () => {
	const { startup } = harness({
		remoteSync: signedOut(),
		signInWith: async () => withoutSession(),
		establishSession: async () => withoutSession()
	});

	await startup.start();
	await startup.signIn();
	await startup.retrySession();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noSession');
	assert.equal(startup.snapshot.error, null, 'nothing new to say');
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

test('signing out puts the wall back up and clears what was drawn for whoever left', async () => {
	const { startup, journal } = harness();

	await startup.start();
	assert.equal(startup.snapshot.state, 'ready');

	const clearedBefore = journal.cacheCleared;
	await startup.signOut();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noAccount');
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
	const { startup, journal } = harness({ remoteSync: signedOut() });

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

	await startup.applySyncOutcome({ action: 'pulled', received: false });
	assert.equal(journal.sessionsExpired, 0);

	await startup.applySyncOutcome({ action: 'signInRequired', received: false });
	assert.equal(journal.sessionsExpired, 1, 'the one outcome the reader has to act on');
});
