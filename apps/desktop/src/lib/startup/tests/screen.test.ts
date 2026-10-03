import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { PAGE_ROUTES, toBreadcrumbTrail } from '$lib/shell/navigation.ts';
import {
	addressAfterSignOut,
	addressAfterSwitch,
	navigationCrossing,
	opensSignedOut,
	startupScreen,
	THE_FIRST_RUN,
	THE_JOIN,
	THE_WAY_IN,
	shellFor,
	wayInCrossing
} from '$lib/startup/screen.ts';
import {
	fakeRecovery,
	harness,
	locked,
	nowhereToGo,
	withoutWorkspace
} from '$lib/startup/tests/harness.ts';

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
	assert.equal(startupScreen(startup.snapshot, '/settings'), 'route');
});

test('and every other address draws the card', async () => {
	const { startup } = harness({ organization: locked() });

	await startup.start();

	for (const address of ADDRESSES) {
		assert.equal(startupScreen(startup.snapshot, address), 'sign-in', address);
	}
});

test('and the way in is an address the card draws over', async () => {
	// a sign-out from an address that opens signed out, and back from the settings opened signed
	// out, land on the way in's own address, so the whole of what makes those work is that it is not
	// one of the addresses that open signed out.
	const { startup } = harness({ organization: locked() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(opensSignedOut(THE_WAY_IN), false);
	assert.equal(startupScreen(startup.snapshot, THE_WAY_IN), 'sign-in');
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
	assert.equal(startupScreen(startup.snapshot, '/settings'), 'route');
	assert.equal(startupScreen(startup.snapshot, '/tenants/a-tenant'), 'sign-in');
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
	assert.equal(startupScreen(startup.snapshot, addressAfterSignOut('/settings')!), 'sign-in');
});

test('and signing back in returns the reader to the address they were on', async () => {
	// there is no navigation to assert on, which is the point: the card is drawn over the route, so
	// the address never moved and the route underneath it draws again.
	const { startup } = harness({ organization: locked() });

	await startup.start();
	assert.equal(startupScreen(startup.snapshot, '/tenants/a-tenant'), 'sign-in');

	await startup.signIn('olivia', 'a long enough password');

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startupScreen(startup.snapshot, '/tenants/a-tenant'), 'route');
});

// --- Every other state, which reads no address ------------------------------------------

test('a startup still running draws the loading screen at every address, settings included', async () => {
	// the failure the spec names as a risk, from the other side: a route drawing for a moment
	// during startup would be a page with nothing behind it, and an address cannot make a shell
	// that is not running into one that is.
	const { startup } = harness();

	assert.equal(startup.snapshot.state, 'loading');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(startupScreen(startup.snapshot, address), 'loading', address);
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
		assert.equal(startupScreen(startup.snapshot, address), 'error', address);
	}
});

test('an update waiting to be finished draws the recovery screen at every address', async () => {
	const { startup } = harness({
		bootstrap: async () => fakeRecovery({ status: 'pending', targetVersion: '0.14.0' })
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'recovery');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(startupScreen(startup.snapshot, address), 'recovery', address);
	}
});

test('and a running application draws whatever address it is on', async () => {
	const { startup } = harness();

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');

	for (const address of [...ADDRESSES, '/settings']) {
		assert.equal(startupScreen(startup.snapshot, address), 'route', address);
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
		assert.equal(startupScreen(startup.snapshot, address), 'no-workspace', address);
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
	assert.equal(startupScreen(startup.snapshot, THE_FIRST_RUN), 'route');
});

// and the join screen is the other: a link opens the application on a machine that has joined
// nothing, and the screen it lands on is the one that reads the link.
test('the join screen opens signed out, and draws as a route rather than the card', async () => {
	assert.equal(opensSignedOut(THE_JOIN), true);
	assert.equal(opensSignedOut(`${THE_JOIN}/anything`), false);

	const { startup } = harness({ organization: nowhereToGo() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startupScreen(startup.snapshot, THE_JOIN), 'route');
});

// --- Where a switch between workspaces leaves the reader ------------------------------------
//
// Criterion 12 of effort 843, asked of the application's own route table and the shell's own
// trail, which is what the root layout hands the root: a place stays, and a record's page goes to
// its concept's directory, because the record on screen belongs to the workspace being left.

/** where a switch sends the reader from `route`, through the trail the shell draws. */
const afterSwitch = (route: string | null) => addressAfterSwitch(route, toBreadcrumbTrail);

test('a switch leaves a directory, the dashboard and the settings area where they are', () => {
	for (const route of ['/', '/tenants', '/complexes', '/contracts', '/settings']) {
		assert.ok(PAGE_ROUTES.includes(route as never), `${route} is a page`);
		assert.equal(afterSwitch(route), null, route);
	}
});

test('and every page with no record in its address stays, the first run and the join included', () => {
	for (const route of PAGE_ROUTES.filter((route) => !route.includes('['))) {
		assert.equal(afterSwitch(route), null, route);
	}
});

test('and a record page goes to the directory its concept is listed in', () => {
	const expected: Record<string, string> = {
		'/tenants/[id]': '/tenants',
		'/complexes/[id]': '/complexes',
		'/complexes/units/[id]': '/complexes',
		'/contracts/[id]': '/contracts',
		'/contracts/units/[id]': '/contracts',
		'/contracts/payments/[id]': '/contracts',
		// a workspace's page (effort 846, ticket 49) sits under the settings area, the place its
		// trail names, so a switch takes the reader to the settings as it takes them off any record.
		'/settings/workspaces/[id]': '/settings'
	};
	const records = PAGE_ROUTES.filter((route) => route.includes('['));

	// the table is every record page the application has, so a new one has to be placed here.
	assert.deepEqual([...records].sort(), Object.keys(expected).sort());

	for (const route of records) {
		const destination = afterSwitch(route);

		assert.equal(destination, expected[route], route);
		// and it lands on a page, one with nothing of the workspace left behind in its address.
		assert.ok(PAGE_ROUTES.includes(destination as never), `${route} lands on ${destination}`);
	}
});

test('and an address no route matched stays, as does a record listed under no place, which goes home', () => {
	assert.equal(afterSwitch(null), null);
	assert.equal(
		addressAfterSwitch('/somewhere/[id]', () => [{ kind: 'record', route: '/somewhere/[id]' }]),
		THE_WAY_IN
	);
});

// --- How much of the shell each state draws -------------------------------------------------
//
// Criterion 7 of effort 843, the half about what is drawn: no state with nobody in draws the
// rail, a switch keeps it, and a startup that stopped draws the bare frame.

test('the way in is drawn on the titlebar alone: signing in, no workspace, and a load with nobody in', async () => {
	const signingIn = harness({ organization: locked() });
	await signingIn.startup.start();
	assert.equal(signingIn.startup.snapshot.state, 'sign-in');
	assert.equal(shellFor(signingIn.startup.snapshot), 'way-in');

	const noWorkspace = harness({ organization: withoutWorkspace() });
	await noWorkspace.startup.start();
	assert.equal(noWorkspace.startup.snapshot.state, 'no-workspace');
	assert.equal(shellFor(noWorkspace.startup.snapshot), 'way-in');

	// a launch, before anything is known, and a load once the wall has been up with nobody in.
	const launching = harness().startup.snapshot;
	assert.equal(launching.state, 'loading');
	assert.equal(shellFor(launching), 'way-in');
	assert.equal(
		shellFor({ ...signingIn.startup.snapshot, state: 'loading', switching: null }),
		'way-in'
	);
});

test('the rail is drawn once a person is in, and a switch keeps it', async () => {
	const { startup } = harness();
	await startup.start();
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(shellFor(startup.snapshot), 'full');

	// a switch's load keeps the rail: only the page loads.
	assert.equal(shellFor({ ...startup.snapshot, state: 'loading', switching: 'South' }), 'full');
});

// requirement 9 (ticket 08): the load after a first run, a join or a sign-in is the way in's last
// step, so the rail arrives with the application rather than with the load.
test('the load after signing in stays on the way in, with a person in and the rail latched', async () => {
	const { startup } = harness();
	await startup.start();

	assert.equal(shellFor({ ...startup.snapshot, state: 'loading', switching: null }), 'way-in');
});

test('a startup that stopped draws the bare frame', () => {
	const base = harness().startup.snapshot;

	assert.equal(shellFor({ ...base, state: 'error' }), 'bare');
	assert.equal(shellFor({ ...base, state: 'recovery' }), 'bare');
});

test('no state with nobody in draws the rail', () => {
	const base = harness({ organization: locked() }).startup.snapshot;

	for (const state of ['loading', 'sign-in', 'no-workspace', 'recovery', 'error'] as const) {
		for (const railIsUp of [false, true]) {
			const snapshot = { ...base, state, railIsUp, switching: null, organization: locked() };

			assert.notEqual(shellFor(snapshot), 'full', `${state}, rail latched: ${railIsUp}`);
		}
	}
});

// --- Which way a move between the welcome and a walk runs ------------------------------------
//
// Ticket 06 of effort 843: the welcome and the first run, and the welcome and the join, are one
// surface changing step, so the route change between them runs forward in and back out.

test('a move from the welcome into a walk runs forward, and back out runs back', () => {
	assert.equal(wayInCrossing(THE_WAY_IN, THE_FIRST_RUN), 'forward');
	assert.equal(wayInCrossing(THE_WAY_IN, THE_JOIN), 'forward');
	assert.equal(wayInCrossing(THE_FIRST_RUN, THE_WAY_IN), 'back');
	assert.equal(wayInCrossing(THE_JOIN, THE_WAY_IN), 'back');
});

// the wall is the card drawn over whatever address the person was on, and "use a link" leaves it
// for the join from there.
test('a move from the wall over any address into the join runs forward too', () => {
	assert.equal(wayInCrossing('/tenants', THE_JOIN), 'forward');
	assert.equal(wayInCrossing('/contracts/[id]', THE_JOIN), 'forward');
});

test('any other move is not a step of the way in', () => {
	assert.equal(wayInCrossing(THE_WAY_IN, '/settings'), null);
	assert.equal(wayInCrossing('/settings', THE_WAY_IN), null);
	assert.equal(wayInCrossing(THE_FIRST_RUN, THE_JOIN), null);
	assert.equal(wayInCrossing('/tenants', '/contracts'), null);
});

// --- Which navigations take a crossing at all -------------------------------------------------
//
// Ticket 14 of effort 843: since ticket 08 the load after a first run or a join is drawn in the
// way-in frame, and the move to the way in each of them makes under it ran a back crossing over the
// loading screen. The arrival is not a step back out of the walk.

/** a machine at the wall with nothing on it, whose standing, once read again, is a person in. */
async function atTheWall() {
	const joined = fakeOrganizationState({
		session: fakeOrganizationSession({
			workspaces: [fakeOrganizationWorkspace({ id: 'acme', name: 'Acme Rentals' })]
		})
	});
	const driven = harness({ organization: nowhereToGo(), afterBootstrap: joined });

	await driven.startup.start();

	return driven.startup;
}

test('back out of a walk to the welcome, before any pass, still crosses', async () => {
	const startup = await atTheWall();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(navigationCrossing(startup.snapshot, THE_JOIN, THE_WAY_IN), 'back');
	assert.equal(navigationCrossing(startup.snapshot, THE_FIRST_RUN, THE_WAY_IN), 'back');
	assert.equal(navigationCrossing(startup.snapshot, THE_WAY_IN, THE_JOIN), 'forward');
});

test("the join's arrival, made under the loading surface, takes no crossing", async () => {
	const startup = await atTheWall();
	const crossings: (string | null)[] = [];

	// as `join.svelte` hands it in: the move to the way in is the pass's `arrive`.
	await startup.standingChanged({
		arrive: async () => {
			crossings.push(navigationCrossing(startup.snapshot, THE_JOIN, THE_WAY_IN));
		}
	});

	assert.deepEqual(crossings, [null]);
	assert.equal(startup.snapshot.state, 'ready');
});

test("the first run's arrivals, after a create and after a connect, take no crossing", async () => {
	const created = await atTheWall();
	const crossings: (string | null)[] = [];

	// the create: the move is half of the pass's `prepare`, beside the first workspace.
	await created.standingChanged({
		prepare: async () => {
			crossings.push(navigationCrossing(created.snapshot, THE_FIRST_RUN, THE_WAY_IN));
		}
	});

	// the connect to an organization that already exists: the move is the pass's `arrive`.
	const connected = await atTheWall();

	await connected.standingChanged({
		arrive: async () => {
			crossings.push(navigationCrossing(connected.snapshot, THE_FIRST_RUN, THE_WAY_IN));
		}
	});

	assert.deepEqual(crossings, [null, null]);
});

test('no navigation with somebody in, or during a switch, crosses', async () => {
	const { startup } = harness();

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(navigationCrossing(startup.snapshot, THE_FIRST_RUN, THE_WAY_IN), null);
	assert.equal(
		navigationCrossing({ state: 'loading', switching: 'South' }, THE_WAY_IN, THE_JOIN),
		null
	);
});

// review round two: the no-workspace screen is drawn over every address, so a link the system
// hands over there moves the address to the join under the same screen, and nothing crosses.
test('a link arriving on the no-workspace screen takes no crossing', async () => {
	const { startup } = harness({ organization: withoutWorkspace() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'no-workspace');
	assert.equal(navigationCrossing(startup.snapshot, THE_WAY_IN, THE_JOIN), null);
	assert.equal(navigationCrossing(startup.snapshot, '/tenants', THE_JOIN), null);
});
