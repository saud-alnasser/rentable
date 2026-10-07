import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import type { HeldByVersion, OrganizationState } from '$lib/organization/host.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';

import { harness, refusal } from './harness.ts';

/**
 * AN ORGANIZATION THAT CANNOT OPEN, AND A WORKSPACE PAST READING
 *
 * Ticket 11 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirements 7 and 8. An
 * organization refused at launch, at sign-in, on switching or on joining is recorded against that
 * organization and the person is put back at the organization switcher, never on the generic
 * failure and never on a wall they cannot leave; a workspace below its read floor is held on the
 * update-required screen with the session's other workspaces to switch to; and a retry never
 * reopens what the version refused. Driven through the harness, with no window.
 */

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });
const south = fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' });

/** two organizations held, `acme` chosen, nobody in, and `acme` past this build's reading. */
const acmeUpgraded = (): OrganizationState =>
	fakeOrganizationState({
		organizations: [acme, beta],
		selected: 'acme',
		session: null,
		heldByVersion: [
			{
				target: 'organization',
				standing: 'unreadable',
				reason: 'the organization is at format 5, past what this build reads'
			}
		]
	});

/** in, on `acme`, holding both workspaces, and what holds it by its version. */
const inWithTwo = (heldByVersion: HeldByVersion[] = []): OrganizationState =>
	fakeOrganizationState({
		organizations: [acme, beta],
		session: fakeOrganizationSession({ workspaces: [north, south] }),
		heldByVersion
	});

const acmeReadOnly: HeldByVersion = {
	target: 'organization',
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded the organization'
};

const northUnreadable: HeldByVersion = {
	target: { workspace: 'north' },
	standing: 'unreadable',
	reason: 'a newer version of rentable upgraded North Properties past what this version reads'
};

// --- launch and resume ----------------------------------------------------------------------

test('a launch whose organization a newer rentable upgraded lands on the switcher with the reason against it', async () => {
	const { startup, journal } = harness({ organization: acmeUpgraded() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in', 'the switcher, on the wall it heads');
	assert.notEqual(startup.snapshot.state, 'error');
	assert.deepEqual(startup.snapshot.refusals.acme, {
		sentence: 'refused: organizationNewer',
		detail: 'the organization is at format 5, past what this build reads',
		byVersion: true
	});
	assert.equal(startup.snapshot.refusals.beta, undefined, 'only that organization carries it');
	assert.equal(startup.snapshot.error, null, 'the reason is the callout, not the wall error');
	assert.equal(journal.bootstrapped, 0, 'nothing behind the wall ran');
	assert.equal(journal.shown, 1);
});

test('and choosing another organization from there opens it, while the refusal stays against the first', async () => {
	const { startup, standWith } = harness({ organization: acmeUpgraded() });

	await startup.start();
	standWith({ ...acmeUpgraded(), heldByVersion: [] });
	await startup.select('beta');

	assert.equal(startup.snapshot.organization?.selected, 'beta');
	assert.equal(startup.snapshot.state, 'sign-in', "beta's own wall, asking for its password");
	assert.equal(startup.snapshot.refusals.beta, undefined);
	assert.ok(startup.snapshot.refusals.acme, 'acme is still the organization that would not open');
});

test('and the refusal clears once that organization opens', async () => {
	const { startup, standWith } = harness({ organization: acmeUpgraded() });

	await startup.start();
	assert.ok(startup.snapshot.refusals.acme);

	// updated: the shell resumes it this time.
	standWith(fakeOrganizationState({ organizations: [acme, beta] }));
	await startup.standingChanged();

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.refusals.acme, undefined);
});

test('a retry that meets the same refusal stays on the switcher rather than looping on the failure', async () => {
	const { startup } = harness({ organization: acmeUpgraded() });

	await startup.start();
	await startup.retry();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.ok(startup.snapshot.refusals.acme?.byVersion);
});

// --- sign-in --------------------------------------------------------------------------------

test('a sign-in refused because a newer rentable upgraded the organization records it against that organization', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({ organizations: [acme, beta], session: null }),
		signInWith: async () => {
			throw refusal('organizationNewer');
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'the password');

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.isSigningIn, false);
	assert.equal(startup.snapshot.error, null);
	assert.equal(startup.snapshot.refusals.acme?.sentence, 'refused: organizationNewer');
	assert.equal(startup.snapshot.refusals.acme?.byVersion, true);
	assert.equal(journal.bootstrapped, 0);

	// trying again meets the same refusal, and stays where it is.
	await startup.signIn('olivia', 'the password');
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.ok(startup.snapshot.refusals.acme);
});

test('any other refusal to open it is recorded the same way, without the update', async () => {
	const { startup } = harness({
		organization: fakeOrganizationState({ organizations: [acme, beta], session: null }),
		signInWith: async () => {
			throw refusal('organizationCredentialLapsed');
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'the password');

	assert.equal(startup.snapshot.refusals.acme?.sentence, 'refused: organizationCredentialLapsed');
	assert.equal(startup.snapshot.refusals.acme?.byVersion, false);
});

test('a refusal about the password still goes to the wall as it did', async () => {
	const { startup } = harness({
		organization: fakeOrganizationState({ organizations: [acme, beta], session: null }),
		signInWith: async () => {
			throw refusal('credentialsWrong');
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'not the password');

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.snapshot.error, 'refused: credentialsWrong');
	assert.deepEqual(startup.snapshot.refusals, {});
});

test('an organization refused after the sign-in, while the workspace opens, signs out to the switcher', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({ organizations: [acme, beta], session: null }),
		bootstrap: async () => {
			throw refusal('organizationNewer');
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'the password');

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.notEqual(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.organization?.session, null, 'signed out, so the switcher works');
	assert.equal(journal.signedOut, 1);
	assert.ok(startup.snapshot.refusals.acme?.byVersion);
	assert.deepEqual(journal.failures, [], 'not the failure screen');
});

// --- a workspace below its read floor ---------------------------------------------------------

test('a launch whose workspace a newer rentable upgraded stands on the update-required screen', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo(),
		openWorkspace: async (id) => {
			if (id === 'north') throw refusal('workspaceNewer');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'held');
	assert.deepEqual(startup.snapshot.held, {
		workspaceId: 'north',
		name: 'North Properties',
		sentence: 'refused: workspaceNewer',
		detail: null
	});
	assert.equal(startup.snapshot.railIsUp, true, 'inside the application');
	assert.deepEqual(journal.failures, []);
	assert.equal(journal.shown, 1);

	// and switching to the other workspace from it opens that one.
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.held, null);
	assert.deepEqual(journal.workspacesOpened, ['north', 'south']);
});

// effort 857, ticket 16: the organization's verdict and the workspace's both cross, and a
// workspace past reading in an organization read-only too still meets the update-required screen.
test('a launch whose organization is read-only and whose workspace is past reading stands on the update-required screen', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo([acmeReadOnly]),
		openWorkspace: async (id) => {
			if (id === 'north') throw refusal('workspaceNewer');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(startup.snapshot.held?.workspaceId, 'north');
	assert.deepEqual(startup.snapshot.refusals, {}, 'the organization opens, read-only');
	assert.deepEqual(journal.failures, []);
});

test('and where the state already carries both verdicts, the launch holds the workspace before opening it', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo([acmeReadOnly, northUnreadable]),
		sync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) })
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'held');
	assert.deepEqual(startup.snapshot.held, {
		workspaceId: 'north',
		name: 'North Properties',
		sentence: 'refused: workspaceNewer',
		detail: null
	});
	assert.deepEqual(startup.snapshot.refusals, {});
	assert.deepEqual(journal.workspacesOpened, [], 'nothing asked the shell to open it again');
	assert.deepEqual(journal.failures, []);

	// and the other workspace still opens from there.
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'ready');
});

test('a workspace refused for its version when the bootstrap opens it is held the same way', async () => {
	const { startup } = harness({
		organization: inWithTwo(),
		bootstrap: async () => {
			throw refusal('workspaceNewer');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(startup.snapshot.held?.workspaceId, 'north');
});

test('switching to a workspace past reading holds it, and a retry does not open it again', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo(),
		openWorkspace: async (id) => {
			if (id === 'south') throw refusal('workspaceNewer');
		}
	});

	await startup.start();
	assert.equal(startup.snapshot.state, 'ready');

	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(startup.snapshot.held?.workspaceId, 'south');
	assert.equal(startup.snapshot.switching, null);

	// choosing it again from the menu does not reach the shell a second time.
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'held');
	assert.deepEqual(journal.workspacesOpened, ['north', 'south']);

	// nor does a retry from the top, which lands back on the update screen.
	await startup.retry();
	assert.equal(startup.snapshot.state, 'held');
	assert.equal(startup.snapshot.held?.workspaceId, 'south');
	assert.deepEqual(journal.workspacesOpened, ['north', 'south']);

	// and the other workspace still opens from there.
	await startup.switchWorkspace('north');
	assert.equal(startup.snapshot.state, 'ready');
});

// --- the ordinary failure -------------------------------------------------------------------

test('a failure that is no refusal is still the ordinary failure, with what it said kept', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo(),
		bootstrap: async () => {
			throw new Error('the disk is full');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.error, 'the disk is full');
	assert.deepEqual(journal.failures, ['the disk is full']);
	assert.deepEqual(startup.snapshot.refusals, {});
});

// --- joining --------------------------------------------------------------------------------

test('a link refused because its organization cannot open returns to the switcher with the reason against it', async () => {
	const { startup } = harness({
		organization: fakeOrganizationState({
			organizations: [acme, beta],
			selected: 'beta',
			session: null
		})
	});
	const arrived: string[] = [];

	await startup.start();

	const routed = await startup.organizationRefused('acme', refusal('organizationNewer'), {
		arrive: async () => void arrived.push('the way in')
	});

	assert.equal(routed, true);
	assert.deepEqual(arrived, ['the way in']);
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(
		startup.snapshot.organization?.selected,
		'acme',
		'its wall, so the callout is above it'
	);
	assert.ok(startup.snapshot.refusals.acme?.byVersion);
});

test('and one about the link itself, or for an organization this machine does not hold, stays on the join screen', async () => {
	const { startup } = harness({
		organization: fakeOrganizationState({ organizations: [acme], session: null })
	});
	const arrived: string[] = [];
	const arrive = async () => void arrived.push('the way in');

	await startup.start();

	assert.equal(await startup.organizationRefused('acme', refusal('lapsed'), { arrive }), false);
	assert.equal(await startup.organizationRefused('acme', refusal('codeWrong'), { arrive }), false);
	assert.equal(
		await startup.organizationRefused('elsewhere', refusal('organizationNewer'), { arrive }),
		false
	);
	assert.deepEqual(arrived, []);
	assert.deepEqual(startup.snapshot.refusals, {});
});
