import assert from 'node:assert/strict';
import test from 'node:test';

import {
	addressAfterSignOut,
	opensSignedOut,
	shellSurface,
	THE_FIRST_RUN,
	THE_JOIN,
	THE_WAY_IN,
	wayInFrom
} from '$lib/layout/shell-surface.ts';
import { fakeRecovery, harness, locked, nowhereToGo, withoutWorkspace } from './testing.ts';

/**
 * WHICH ADDRESS DRAWS, AND IN WHICH STATE
 *
 * The account menu has offered a settings row to a machine nobody is signed in on since #646, and
 * pressing it changed the address and left the same sign-in card on screen: the card was drawn in
 * place of the route for every address. The API half of that requirement landed and this half did
 * not, and it merged with its own criterion unmet because nothing tested it. That is why the test
 * is named as a criterion on the ticket rather than left to whoever built it.
 *
 * Every state below is reached by driving the real unit rather than by writing out a snapshot: a
 * hand-built partial of `StartupSnapshot` is a shape nothing produces, and a test that agrees with
 * one says nothing about the application.
 */

const ADDRESSES = [
	'/',
	'/tenants',
	'/tenants/a-tenant',
	'/complexes',
	'/contracts',
	'/workspace',
	'/account'
] as const;

// --- The wall, which is the one state that reads the address ---------------------------

test('with nobody signed in, settings draws the settings page rather than the card', async () => {
	const { startup } = harness({ organization: locked() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, '/settings'), 'route');
});

test('and every other address draws the card', async () => {
	const { startup } = harness({ organization: locked() });

	await startup.start();

	for (const address of ADDRESSES) {
		assert.equal(shellSurface(startup.snapshot, address), 'sign-in', address);
	}
});

test('and the way in from the rail lands on an address the card draws over', async () => {
	// the row in the account menu navigates rather than signing anybody in, so the whole of what
	// makes it work is that its destination is not one of the addresses that open signed out. On
	// `/settings` the card is not drawn, and the row reached the consent screen from there without
	// the surface that names the provider ever appearing.
	const { startup } = harness({ organization: locked() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(wayInFrom('/settings'), THE_WAY_IN);
	assert.equal(opensSignedOut(THE_WAY_IN), false);
	assert.equal(shellSurface(startup.snapshot, THE_WAY_IN), 'sign-in');
});

test('and it goes nowhere from an address the card is already drawn over', () => {
	// the reader keeps their place. Signing out on a record leaves the card over that record, and
	// navigating away from it to reach a card already on screen would lose the address the route
	// underneath draws from on the way back in.
	for (const address of ADDRESSES) {
		assert.equal(wayInFrom(address), null, address);
	}
});

test('and the surface alone would leave the settings page drawn over a signed-out machine', async () => {
	// what this unit answers on its own, which is why the route has to ask a second question. An
	// address that opens signed out draws its route whether or not anybody is signed in, so a
	// reader who signs out while reading settings would go on reading the settings of a machine
	// nobody is signed in on; one who signs out on a record meets the card over the address they
	// were on and needs nothing. `addressAfterSignOut` below is the half that closes the first.
	const { startup } = harness();

	await startup.start();
	assert.equal(startup.snapshot.state, 'ready');

	await startup.signOut();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, '/settings'), 'route');
	assert.equal(shellSurface(startup.snapshot, '/tenants/a-tenant'), 'sign-in');
});

// effort 826, requirement 11 as corrected on 2026-09-15: signing out lands on the wall from any
// address. The card covers every address but the three that open signed out, and those three are
// the ones a sign-out has to leave.
test('a sign-out from an address that opens signed out lands on the way in', () => {
	for (const address of ['/settings', THE_FIRST_RUN, THE_JOIN]) {
		assert.equal(addressAfterSignOut(address), THE_WAY_IN, address);
	}

	// and the address it lands on is one the card draws over, which is the whole of why it works.
	assert.equal(opensSignedOut(THE_WAY_IN), false);
});

test('and from anywhere else it goes nowhere, so the reader keeps their place', () => {
	// the card is drawn over the address the moment the standing changes, so moving the reader
	// would cost them the route that draws again on the way back in for nothing.
	for (const address of ADDRESSES) {
		assert.equal(addressAfterSignOut(address), null, address);
	}
});

test('and the wall is what the frame draws once a sign-out has landed there', async () => {
	// the two halves together: the standing changes, the route leaves `/settings`, and the address
	// it leaves for is one the card covers.
	const { startup } = harness();

	await startup.start();
	await startup.signOut();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, addressAfterSignOut('/settings')!), 'sign-in');
});

test('and signing back in returns the reader to the address they were on', async () => {
	// there is no navigation to assert on, which is the point: the card is drawn over the route, so
	// the address never moved and the route underneath it draws again.
	const { startup } = harness({ organization: locked() });

	await startup.start();
	assert.equal(shellSurface(startup.snapshot, '/tenants/a-tenant'), 'sign-in');

	await startup.signIn('olivia', 'a long enough password');

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(shellSurface(startup.snapshot, '/tenants/a-tenant'), 'route');
});

// --- Every other state, which reads no address ------------------------------------------

test('a startup still running draws the loading screen at every address, settings included', async () => {
	// the failure the spec names as a risk, from the other side: a route drawing for a moment
	// during startup would be a page with nothing behind it, and an address cannot make a shell
	// that is not running into one that is.
	const { startup } = harness();

	assert.equal(startup.snapshot.state, 'loading');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(shellSurface(startup.snapshot, address), 'loading', address);
	}
});

test('a startup that failed draws the failure at every address, settings included', async () => {
	const { startup } = harness({
		bootstrap: async () => {
			throw new Error('the workspace could not be opened');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'error');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(shellSurface(startup.snapshot, address), 'error', address);
	}
});

test('an update waiting to be finished draws the recovery screen at every address', async () => {
	const { startup } = harness({
		bootstrap: async () => fakeRecovery({ status: 'pending', targetVersion: '0.14.0' })
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'recovery');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(shellSurface(startup.snapshot, address), 'recovery', address);
	}
});

test('and a running application draws whatever address it is on', async () => {
	const { startup } = harness();

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(shellSurface(startup.snapshot, address), 'route', address);
	}
});

// --- The list itself --------------------------------------------------------------------

test('the address matches exactly, so nothing that merely starts with it is admitted', () => {
	assert.equal(opensSignedOut('/settings'), true);
	assert.equal(opensSignedOut('/settings/anything'), false);
	assert.equal(opensSignedOut('/settingsomething'), false);
	assert.equal(opensSignedOut('/'), false);
});

// a member admitted to an organization with no workspace in it is in and going nowhere: the
// surface says so over every address, because there is no workspace for any address to draw.
test('a member with no workspace sees the no-workspace surface over every address', async () => {
	const { startup } = harness({ organization: withoutWorkspace() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'no-workspace');

	for (const address of [...ADDRESSES, '/settings', THE_FIRST_RUN]) {
		assert.equal(shellSurface(startup.snapshot, address), 'no-workspace', address);
	}
});

// the first run is the one address that cannot be behind the wall it exists to get a person
// past: an organization has no members until the walk there has made its owner.
test('the first run opens signed out, and draws as a route rather than the card', async () => {
	assert.equal(opensSignedOut(THE_FIRST_RUN), true);
	assert.equal(opensSignedOut(`${THE_FIRST_RUN}/anything`), false);

	const { startup } = harness({ organization: locked() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, THE_FIRST_RUN), 'route');
	assert.equal(wayInFrom(THE_FIRST_RUN), THE_WAY_IN);
});

// and the join screen is the other: a link opens the application on a machine that has joined
// nothing, and the screen it lands on is the one that reads the link.
test('the join screen opens signed out, and draws as a route rather than the card', async () => {
	assert.equal(opensSignedOut(THE_JOIN), true);
	assert.equal(opensSignedOut(`${THE_JOIN}/anything`), false);

	const { startup } = harness({ organization: nowhereToGo() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, THE_JOIN), 'route');
	assert.equal(wayInFrom(THE_JOIN), THE_WAY_IN);
});
