import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeHeldOrganization,
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
 * vault, one that does, and a sign-out, with the organization switcher's choice and remove (effort
 * 851), which are the wall's way to another organization and its way out. Driven the same way,
 * through the harness, with no window and no module mocked.
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
		sync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'south' }) }),
		organization: held
	});

	await remembered.startup.start();

	assert.deepEqual(remembered.journal.workspacesOpened, ['south']);

	const lost = harness({
		sync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'gone' }) }),
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

// --- The switcher: choosing, and forgetting, one of several organizations (effort 851) --------

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({
	id: 'beta',
	name: 'Beta Lettings',
	holdsTursoAuthority: false
});

/** two organizations held, `acme` chosen, nobody in. */
const twoLocked = () =>
	fakeOrganizationState({ organizations: [acme, beta], selected: 'acme', session: null });

/** two organizations held, `acme` chosen and signed in to, with no workspace in it yet. */
const twoWithoutWorkspace = () =>
	fakeOrganizationState({
		organizations: [acme, beta],
		selected: 'acme',
		session: fakeOrganizationSession({ organizationId: 'acme', workspaces: [] })
	});

// criterion 3: choosing the other organization at the wall puts its wall up, asking for its
// username and password. The choice is the record's, so it is read back rather than held here.
test('choosing another organization at the wall puts its wall up', async () => {
	const { startup, journal } = harness({ organization: twoLocked() });

	await startup.start();
	await startup.select('beta');

	assert.deepEqual(journal.selected, ['beta']);
	assert.equal(journal.signedOut, 0, 'nobody was in to sign out');
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'locked');
	assert.equal(startup.snapshot.organization?.selected, 'beta');
	assert.equal(startup.snapshot.error, null);
});

test('and choosing the one already chosen asks the shell nothing', async () => {
	const { startup, journal } = harness({ organization: twoLocked() });

	await startup.start();
	await startup.select('acme');

	assert.deepEqual(journal.selected, []);
});

// criterion 6: nothing is chosen or forgotten while the screen is busy, a sign-in on the wall and
// a create on the no-workspace screen.
test('nothing is chosen or forgotten while a password is being tried', async () => {
	let answer: (state: ReturnType<typeof twoLocked>) => void = () => {};
	const { startup, journal } = harness({
		organization: twoLocked(),
		signInWith: () => new Promise((resolve) => (answer = resolve))
	});

	await startup.start();

	const signingIn = startup.signIn('olivia', 'a long enough password');

	assert.equal(startup.snapshot.isSigningIn, true);
	await startup.select('beta');
	await startup.remove('beta');

	assert.deepEqual(journal.selected, []);
	assert.deepEqual(journal.removed, []);

	answer(twoLocked());
	await signingIn;
});

test('nor while a workspace is being created on the no-workspace screen', async () => {
	const { startup, journal } = harness({ organization: twoWithoutWorkspace() });

	await startup.start();
	assert.equal(startup.snapshot.state, 'no-workspace');

	await startup.select('beta', { isCreating: true });
	await startup.remove('beta', { isCreating: true });

	assert.deepEqual(journal.selected, []);
	assert.deepEqual(journal.removed, []);
	assert.equal(startup.snapshot.state, 'no-workspace');
});

// criterion 7 and requirement 8: switching happens signed out, so choosing from the no-workspace
// screen signs the member out first and lands on the chosen organization's wall.
test('choosing from the no-workspace screen signs out first, then puts the chosen wall up', async () => {
	const { startup, journal } = harness({ organization: twoWithoutWorkspace() });

	await startup.start();
	assert.equal(startup.snapshot.state, 'no-workspace');

	await startup.select('beta');

	assert.equal(journal.signedOut, 1);
	assert.deepEqual(journal.selected, ['beta']);
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.organization?.selected, 'beta');
	assert.equal(startup.snapshot.organization?.session, null);
});

test('and removing another organization from there leaves the member in, where they were', async () => {
	const { startup, journal } = harness({ organization: twoWithoutWorkspace() });

	await startup.start();
	await startup.remove('beta');

	assert.deepEqual(journal.removed, ['beta']);
	assert.equal(journal.signedOut, 0);
	assert.equal(startup.snapshot.state, 'no-workspace');
	assert.deepEqual(
		startup.snapshot.organization?.organizations.map((held) => held.id),
		['acme']
	);
});

// criterion 5: removing one forgets that one alone; removing the chosen one moves the wall to
// another, and removing the last brings the welcome back.
test('removing the chosen organization at the wall puts the next one up', async () => {
	const { startup, journal } = harness({ organization: twoLocked() });

	await startup.start();

	const clearedBefore = journal.cacheCleared;
	await startup.remove('acme');

	assert.deepEqual(journal.removed, ['acme']);
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'locked');
	assert.equal(startup.snapshot.organization?.selected, 'beta');
	assert.equal(journal.cacheCleared, clearedBefore + 1, 'nothing drawn for it survives');
	assert.deepEqual(journal.workspacesOpened, []);
	assert.equal(journal.bootstrapped, 0);
});

test('and removing the last one held brings the welcome back', async () => {
	const { startup } = harness({ organization: locked() });

	await startup.start();
	assert.equal(startup.snapshot.signInReason, 'locked');

	await startup.remove('acme');

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.signInReason, 'noOrganization');
	assert.deepEqual(startup.snapshot.organization?.organizations, []);
	assert.equal(startup.snapshot.organization?.selected, null);
});

// the confirm is still open when the shell refuses, and it says the refusal in place.
test('a remove the shell refused is thrown back to the confirm, and the wall is as it was', async () => {
	const { startup, journal } = harness({
		organization: twoLocked(),
		remove: async () => {
			throw new Error('a replica would not go');
		}
	});

	await startup.start();

	await assert.rejects(startup.remove('acme'), /a replica would not go/);
	assert.deepEqual(journal.removed, ['acme']);
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.organization?.selected, 'acme', 'the organization is still held');
});

test('and a choice the shell refused is said on the wall the person is standing at', async () => {
	const { startup } = harness({
		organization: twoLocked(),
		select: async () => {
			throw new Error('that organization is not held here');
		}
	});

	await startup.start();
	await startup.select('beta');

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.organization?.selected, 'acme');
	assert.equal(startup.snapshot.error, 'that organization is not held here');
});

// --- A refused link, read in place (effort 851, the review of requirement 13) ---------------

// a link for a held organization selects it where nobody is in, and is then refused: the wall
// names the organization the link chose, with no loading pass over the refusal, and choosing the
// first again at the switcher reaches the shell rather than reading as the one already chosen.
test('a refused link is read in place, so the wall names the organization the link chose', async () => {
	const { startup, journal, seen, standWith } = harness({ organization: twoLocked() });

	await startup.start();

	const before = seen.length;

	// the shell selected the link's organization before it refused the link.
	standWith({ ...twoLocked(), selected: 'beta' });
	await startup.linkRefused();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.organization?.selected, 'beta');
	assert.ok(
		seen.slice(before).every((snapshot) => snapshot.state !== 'loading'),
		'a loading pass took the refusal away'
	);

	await startup.select('acme');

	assert.deepEqual(journal.selected, ['acme']);
	assert.equal(startup.snapshot.organization?.selected, 'acme');
});

// a link for the organization open now ends the session to be judged on its replica: the wall goes
// up behind the refusal, and the held context is let go of.
test('a refused link that ended the session puts the wall up behind it', async () => {
	const { startup, journal, seen, standWith } = harness({ organization: twoWithoutWorkspace() });

	await startup.start();
	assert.equal(startup.snapshot.state, 'no-workspace');

	const before = seen.length;
	const forgotten = journal.contextsForgotten;

	standWith(twoLocked());
	await startup.linkRefused();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.organization?.session, null);
	assert.ok(journal.contextsForgotten > forgotten, 'the held context was kept');
	assert.ok(seen.slice(before).every((snapshot) => snapshot.state !== 'loading'));
});

// and anywhere else the session is left open, and so is the screen the person is on.
test('a refused link that left the session open leaves the person where they were', async () => {
	const { startup, journal, seen } = harness({ organization: twoWithoutWorkspace() });

	await startup.start();

	const before = seen.length;
	const forgotten = journal.contextsForgotten;

	await startup.linkRefused();

	assert.equal(startup.snapshot.state, 'no-workspace');
	assert.equal(startup.snapshot.organization?.session?.organizationId, 'acme');
	assert.equal(journal.contextsForgotten, forgotten);
	assert.ok(seen.slice(before).every((snapshot) => snapshot.state !== 'loading'));
});
