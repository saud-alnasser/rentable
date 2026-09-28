import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';

import { harness, locked, unlocked, withoutWorkspace } from './harness.ts';

/**
 * THE WALL, AS THE EIGHT PATHS MEET IT
 *
 * Paths 3, 4 and 7 of the eight `launch.test.ts` introduces: a password that does not open the
 * vault, one that does, and a sign-out, with the forget that is the wall's way out. Driven the
 * same way, through the harness, with no window and no module mocked.
 */

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
