import assert from 'node:assert/strict';
import test from 'node:test';

import { opensSignedOut, shellSurface, THE_WAY_IN, wayInFrom } from '$lib/layout/shell-surface.ts';
import { fakeRecovery, harness, signedOut } from './testing.ts';

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
	const { startup } = harness({ remoteSync: signedOut() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, '/settings'), 'route');
});

test('and every other address draws the card', async () => {
	const { startup } = harness({ remoteSync: signedOut() });

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
	const { startup } = harness({ remoteSync: signedOut() });

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

test('and signing out on the settings page leaves it drawn, where signing out elsewhere does not', async () => {
	// the two halves of the same criterion: nothing navigates on the way out, so a reader who
	// signs out while reading settings goes on reading settings, and one who signs out on a record
	// meets the card over the address they were on.
	const { startup } = harness();

	await startup.start();
	assert.equal(startup.snapshot.state, 'ready');

	await startup.signOut();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(shellSurface(startup.snapshot, '/settings'), 'route');
	assert.equal(shellSurface(startup.snapshot, '/tenants/a-tenant'), 'sign-in');
});

test('and signing back in returns the reader to the address they were on', async () => {
	// there is no navigation to assert on, which is the point: the card is drawn over the route, so
	// the address never moved and the route underneath it draws again.
	const { startup } = harness({ remoteSync: signedOut() });

	await startup.start();
	assert.equal(shellSurface(startup.snapshot, '/tenants/a-tenant'), 'sign-in');

	await startup.signIn();

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
