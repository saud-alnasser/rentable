import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import type { OrganizationState } from '$lib/organization/host.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';
import type { TauriRefusalReason } from '$lib/error/tauri.ts';

import { fakeRecovery, harness, refusal } from './harness.ts';

/**
 * A REFUSAL SIGNS OUT ONLY WHAT IT IS ABOUT
 *
 * Ticket 25 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirements 7 and 8, found
 * at review round one. A refusal about one workspace keeps the person in the organization, on the
 * screen that names the reason with the session's other workspaces to open; nothing of one
 * organization's last open carries over to the next; and a link refused for one organization
 * never signs the person out of another they are in. Driven through the harness, with no window.
 */

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });
const south = fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' });
const east = fakeOrganizationWorkspace({ id: 'east', name: 'East Lettings' });
const west = fakeOrganizationWorkspace({ id: 'west', name: 'West Lettings' });

/** in, on `acme`, holding both its workspaces. */
const inAcme = (): OrganizationState =>
	fakeOrganizationState({
		organizations: [acme, beta],
		selected: 'acme',
		session: fakeOrganizationSession({ workspaces: [north, south] })
	});

/** in, on `beta`, holding both its workspaces. */
const inBeta = (): OrganizationState =>
	fakeOrganizationState({
		organizations: [acme, beta],
		selected: 'beta',
		session: fakeOrganizationSession({
			organizationId: 'beta',
			organizationName: 'Beta Lettings',
			workspaces: [east, west]
		})
	});

/**
 * the reasons a workspace's open can meet that are about that workspace, or about something that
 * failed in it, and not about the organization: each keeps the person in.
 */
const ABOUT_THE_WORKSPACE: { reason: TauriRefusalReason; byVersion: boolean }[] = [
	{ reason: 'workspaceBehind', byVersion: false },
	{ reason: 'workspaceNeedsOpening', byVersion: false },
	{ reason: 'copyNotTaken', byVersion: false },
	{ reason: 'shapeNotAsBuilt', byVersion: false },
	{ reason: 'workspaceReadOnlyByVersion', byVersion: true },
	{ reason: 'changesUnsendableAfterUpgrade', byVersion: false },
	{ reason: 'workspaceMissing', byVersion: false },
	{ reason: 'noGrant', byVersion: false },
	{ reason: 'databaseRefused', byVersion: false },
	{ reason: 'tursoNotConnected', byVersion: false },
	{ reason: 'upgradeUnderWay', byVersion: false }
];

for (const { reason, byVersion } of ABOUT_THE_WORKSPACE) {
	test(`a workspace's open refused as ${reason} keeps the person in, on the screen that names it, with the others to open`, async () => {
		let opened = 'north';
		const { startup, journal } = harness({
			organization: inAcme(),
			openWorkspace: async (id) => void (opened = id),
			bootstrap: async () => {
				if (opened === 'south') throw refusal(reason);

				return fakeRecovery();
			}
		});

		await startup.start();
		assert.equal(startup.snapshot.state, 'ready');

		await startup.switchWorkspace('south');

		assert.equal(startup.snapshot.state, 'held', 'the screen that names the reason');
		assert.deepEqual(startup.snapshot.held, {
			workspaceId: 'south',
			name: 'South Properties',
			sentence: `refused: ${reason}`,
			detail: null,
			byVersion
		});
		assert.equal(startup.snapshot.organization?.session?.organizationId, 'acme', 'still in');
		assert.equal(journal.signedOut, 0);
		assert.deepEqual(startup.snapshot.refusals, {}, 'nothing recorded against the organization');
		assert.deepEqual(journal.failures, [], 'not the failure screen');

		// the other workspace opens from there.
		await startup.switchWorkspace('north');

		assert.equal(startup.snapshot.state, 'ready');
		assert.equal(startup.snapshot.held, null);
	});
}

test('a refusal of the organization while a workspace opens still signs out to the switcher', async () => {
	const { startup, journal } = harness({
		organization: inAcme(),
		bootstrap: async () => {
			throw refusal('youWereRemoved');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(journal.signedOut, 1);
	assert.ok(startup.snapshot.refusals.acme);
});

test('a workspace refused for another reason is opened again when the person chooses it', async () => {
	let full = true;
	let opened = 'north';
	const { startup, journal } = harness({
		organization: inAcme(),
		openWorkspace: async (id) => void (opened = id),
		bootstrap: async () => {
			if (opened === 'south' && full) throw refusal('copyNotTaken');

			return fakeRecovery();
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'held');

	// the disk was cleared, and trying again opens it.
	full = false;
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'ready');
	assert.deepEqual(journal.workspacesOpened, ['north', 'south', 'south']);
});

// --- what carries over -----------------------------------------------------------------------

test('a sign-in after a workspace refusal does not reopen the refused workspace by itself', async () => {
	let opened = 'north';
	const { startup, journal } = harness({
		organization: inAcme(),
		signInWith: async () => inAcme(),
		openWorkspace: async (id) => void (opened = id),
		bootstrap: async () => {
			if (opened === 'south') throw refusal('workspaceBehind');

			return fakeRecovery();
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'held');

	await startup.signOut();
	await startup.signIn('olivia', 'the password');

	assert.deepEqual(journal.workspacesOpened, ['north', 'south'], 'south is not asked for again');
	assert.equal(startup.snapshot.state, 'held', 'its screen, with the others to open');
	assert.equal(startup.snapshot.held?.workspaceId, 'south');
	assert.deepEqual(startup.snapshot.refusals, {});
});

test('another organization opens its own last workspace, not the one refused in the first', async () => {
	const { startup, journal, syncWith } = harness({
		organization: inAcme(),
		signInWith: async () => inBeta(),
		openWorkspace: async (id) => {
			if (id === 'south') throw refusal('workspaceNewer');
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'held');

	// choosing beta moves the machine's own record to the workspace beta had open last.
	syncWith(fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'west' }) }));
	await startup.select('beta');
	assert.equal(startup.snapshot.state, 'sign-in');

	await startup.signIn('olivia', 'the password');

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(journal.workspacesOpened.at(-1), 'west');
});

test('leaving by sign-out clears the last open, so the next sign-in opens what the shell recorded', async () => {
	const { startup, journal, syncWith } = harness({
		organization: inAcme(),
		signInWith: async () => inAcme(),
		openWorkspace: async (id) => {
			if (id === 'south') throw refusal('workspaceNewer');
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');
	await startup.signOut();

	syncWith(fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) }));
	await startup.signIn('olivia', 'the password');

	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(journal.workspacesOpened.at(-1), 'north');
});

// --- joining ---------------------------------------------------------------------------------

test('a link refused for one organization never signs the person out of another they are in', async () => {
	for (const reason of ['tursoNotConnected', 'organizationNewer'] as const) {
		const { startup, journal } = harness({
			organization: inBeta(),
			sync: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'east' }) })
		});
		const arrived: string[] = [];

		await startup.start();
		assert.equal(startup.snapshot.state, 'ready');

		const routed = await startup.organizationRefused('acme', refusal(reason), {
			arrive: async () => void arrived.push('the way in')
		});

		assert.equal(routed, false, `${reason}: the join screen says it`);
		assert.equal(journal.signedOut, 0, `${reason}: still in beta`);
		assert.equal(startup.snapshot.organization?.session?.organizationId, 'beta');
		assert.equal(startup.snapshot.state, 'ready');
		assert.deepEqual(arrived, []);
	}
});

test('a link refused for any reason that is not the organization stays on the join screen', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({ organizations: [acme, beta], session: null })
	});

	await startup.start();

	assert.equal(await startup.organizationRefused('acme', refusal('tursoNotConnected')), false);
	assert.equal(journal.signedOut, 0);
	assert.deepEqual(startup.snapshot.refusals, {});
});
