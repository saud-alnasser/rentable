import assert from 'node:assert/strict';
import test from 'node:test';

import type { HeldByVersion, OrganizationState } from '$lib/organization/host.ts';
import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';

import { harness, refusal } from './harness.ts';

/**
 * THE APP LOOKS FOR AN UPDATE WHENEVER A VERSION HOLDS IT
 *
 * Ticket 18 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirement 12. Besides
 * the launch, the app looks for a newer release each time a version holds it, so a held person
 * sees a release without pressing anything: an organization refused for its version (the
 * switcher's callout), a workspace on the workspace-held screen, and read-only by version. Each
 * hold asks once when it begins, and staying in it asks nothing more. Driven through the harness,
 * with no window; what the look itself does is the updater's (`update/tests/updater.svelte.test.ts`).
 */

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });
const south = fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' });

/** in, on `acme`, holding both workspaces, and what holds it by its version. */
const inWithTwo = (heldByVersion: HeldByVersion[] = []): OrganizationState =>
	fakeOrganizationState({
		organizations: [acme, beta],
		session: fakeOrganizationSession({ workspaces: [north, south] }),
		heldByVersion
	});

const onNorth = () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) });

const acmeUnreadable: HeldByVersion = {
	target: 'organization',
	standing: 'unreadable',
	reason: 'the organization is at format 5, past what this build reads'
};

const acmeReadOnly: HeldByVersion = {
	target: 'organization',
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded the organization'
};

const northReadOnly: HeldByVersion = {
	target: { workspace: 'north' },
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded North Properties'
};

test('a launch nothing holds looks at launch alone', async () => {
	const { startup, journal } = harness({ organization: inWithTwo(), sync: onNorth() });

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(journal.heldLooks, 0);
});

// --- an organization refused for its version ------------------------------------------------

test('an organization refused for its version looks once, and the switcher it stays on looks no more', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({
			organizations: [acme, beta],
			selected: 'acme',
			session: null,
			heldByVersion: [acmeUnreadable]
		})
	});

	await startup.start();

	assert.ok(startup.snapshot.refusals.acme?.byVersion, 'the switcher, with the callout');
	assert.equal(journal.heldLooks, 1);

	// a retry meets the same refusal and stays in the same hold.
	await startup.retry();
	await startup.retry();

	assert.ok(startup.snapshot.refusals.acme?.byVersion);
	assert.equal(journal.heldLooks, 1);
});

test('an organization refused for any other reason is no version hold, and looks for nothing', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({ organizations: [acme, beta], session: null }),
		signInWith: async () => {
			throw refusal('organizationCredentialLapsed');
		}
	});

	await startup.start();
	await startup.signIn('olivia', 'the password');

	assert.equal(startup.snapshot.refusals.acme?.byVersion, false);
	assert.equal(journal.heldLooks, 0);
});

// --- a workspace on the workspace-held screen ----------------------------------------------

test('a workspace on the workspace-held screen looks once, however often it is retried', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo(),
		openWorkspace: async (id) => {
			if (id === 'north') throw refusal('workspaceNewer');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(journal.heldLooks, 1);

	await startup.retry();
	await startup.switchWorkspace('north');

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(journal.heldLooks, 1, 'still the one hold');

	// leaving it for a workspace that opens ends the hold; coming back to it begins another.
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(journal.heldLooks, 1);

	await startup.switchWorkspace('north');
	assert.equal(startup.snapshot.state, 'held');
	assert.equal(journal.heldLooks, 2);
});

// --- read-only by version -------------------------------------------------------------------

test('a launch into an organization read-only by its version looks once', async () => {
	const { startup, journal } = harness({
		organization: inWithTwo([acmeReadOnly]),
		sync: onNorth()
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'ready', 'in, and reading');
	assert.equal(journal.heldLooks, 1);
});

test('a heartbeat that pulls a read-only raise looks once, and the heartbeats after it look no more', async () => {
	const { startup, journal, standWith } = harness({
		organization: inWithTwo(),
		sync: onNorth()
	});

	await startup.start();
	assert.equal(journal.heldLooks, 0);

	standWith(inWithTwo([northReadOnly]));

	for (let beat = 0; beat < 3; beat += 1) {
		await startup.applySyncOutcome({
			action: 'none',
			received: beat === 1,
			workspaceId: 'north',
			heldByVersion: [northReadOnly]
		});
	}

	assert.deepEqual(startup.snapshot.organization?.heldByVersion, [northReadOnly]);
	assert.equal(journal.heldLooks, 1);
});
