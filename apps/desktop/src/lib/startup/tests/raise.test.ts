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

import { A_DAY, AT, harness } from './harness.ts';

/**
 * A RAISE PULLED INTO A RUNNING APPLICATION
 *
 * Ticket 12 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirements 6 and 9 and
 * criteria 6 and 9. A heartbeat's pull can bring a newer rentable's upgrade into an application
 * already open, and the shell judges it before anything went out (`heldByVersion` on the
 * dispatch's answer). What this side owes is to move before anything else is written: read-only
 * below the write floor, and below the read floor the switcher for the organization or the
 * update-required screen for the workspace. The reconcile that follows a pull, and the one a day
 * crossing runs, write the derived columns, so neither runs while the version holds the session.
 */

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' });
const beta = fakeHeldOrganization({ id: 'beta', name: 'Beta Lettings' });
const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });
const south = fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' });

/** in, on `acme`, holding both workspaces, with `north` open. */
const inWithTwo = (heldByVersion: HeldByVersion | null = null): OrganizationState =>
	fakeOrganizationState({
		organizations: [acme, beta],
		session: fakeOrganizationSession({ workspaces: [north, south] }),
		heldByVersion
	});

const onNorth = () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) });

const northReadOnly: HeldByVersion = {
	target: { workspace: 'north' },
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded North Properties'
};

const northUnreadable: HeldByVersion = {
	target: { workspace: 'north' },
	standing: 'unreadable',
	reason: 'a newer version of rentable upgraded North Properties past what this version reads'
};

const acmeReadOnly: HeldByVersion = {
	target: 'organization',
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded the organization'
};

const acmeUnreadable: HeldByVersion = {
	target: 'organization',
	standing: 'unreadable',
	reason: 'a newer version of rentable upgraded the organization past what this version reads'
};

/** a running application on `north`, and the shell about to answer the next read with `held`. */
async function running() {
	const ran = harness({ organization: inWithTwo(), sync: onNorth() });

	await ran.startup.start();
	assert.equal(ran.startup.snapshot.state, 'ready');

	return ran;
}

// --- below the write floor ------------------------------------------------------------------

test('a pulled write-floor raise on the open workspace moves it to read-only before any reconcile', async () => {
	const { startup, journal, standWith } = await running();
	const reconciled = journal.reconciled;
	const everything = journal.invalidatedAll;

	standWith(inWithTwo(northReadOnly));
	await startup.applySyncOutcome({
		action: 'none',
		received: true,
		workspaceId: 'north',
		heldByVersion: northReadOnly
	});

	assert.deepEqual(startup.snapshot.organization?.heldByVersion, northReadOnly);
	assert.equal(startup.snapshot.state, 'ready', 'still reading, inside the application');
	assert.equal(journal.announced, 0, 'the reconcile after the pull would write the workspace');
	assert.equal(journal.reconciled, reconciled);
	// the rows the pull brought are still shown: the query cache is told, without a reconcile.
	assert.equal(journal.invalidatedAll, everything + 1);
});

test('the verdict is the outcome, even where the shell answers the state as it was', async () => {
	const { startup, journal } = await running();

	// the read of the organization lags the dispatch: the dispatch's own verdict decides.
	await startup.applySyncOutcome({
		action: 'none',
		received: true,
		workspaceId: 'north',
		heldByVersion: northReadOnly
	});

	assert.deepEqual(startup.snapshot.organization?.heldByVersion, northReadOnly);
	assert.equal(journal.announced, 0);
});

test('and the day-crossing reconcile does nothing while the session is read-only', async () => {
	const { startup, journal, now, standWith } = await running();

	standWith(inWithTwo(northReadOnly));
	await startup.applySyncOutcome({
		action: 'none',
		received: false,
		workspaceId: 'north',
		heldByVersion: northReadOnly
	});

	const reconciled = journal.reconciled;
	now.value = AT + A_DAY;
	await startup.reconcileOnDayCrossing();

	assert.equal(journal.reconciled, reconciled, 'a day crossed under a read-only session');
});

test('an organization raised past what this build writes is read-only too, and reconciles nothing', async () => {
	const { startup, journal, now, standWith } = await running();

	standWith(inWithTwo(acmeReadOnly));
	await startup.applySyncOutcome({
		action: 'none',
		received: true,
		workspaceId: 'north',
		heldByVersion: acmeReadOnly
	});

	assert.equal(startup.snapshot.state, 'ready');
	assert.deepEqual(startup.snapshot.organization?.heldByVersion, acmeReadOnly);
	assert.equal(journal.announced, 0);

	const reconciled = journal.reconciled;
	now.value = AT + A_DAY;
	await startup.reconcileOnDayCrossing();

	assert.equal(journal.reconciled, reconciled);
});

test('a pull that raises nothing reconciles as it always has', async () => {
	const { startup, journal, now } = await running();

	await startup.applySyncOutcome({
		action: 'none',
		received: true,
		workspaceId: 'north',
		heldByVersion: null
	});

	assert.equal(journal.announced, 1);

	const reconciled = journal.reconciled;
	now.value = AT + A_DAY;
	await startup.reconcileOnDayCrossing();

	assert.equal(journal.reconciled, reconciled + 1);
});

// --- below the read floor -------------------------------------------------------------------

test('a pulled read-floor raise on the open workspace stands the update-required screen in its place', async () => {
	const { startup, journal, standWith } = await running();

	standWith(inWithTwo(northUnreadable));
	await startup.applySyncOutcome({
		action: 'none',
		received: true,
		workspaceId: 'north',
		heldByVersion: northUnreadable
	});

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(startup.snapshot.held?.workspaceId, 'north');
	assert.equal(startup.snapshot.held?.name, 'North Properties');
	assert.equal(startup.snapshot.held?.sentence, 'refused: workspaceNewer');
	assert.equal(journal.announced, 0, 'nothing reconciled into a workspace past reading');
	assert.deepEqual(journal.failures, [], 'not the failure screen');

	// and the other workspace still opens from there.
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'ready');
});

test('a pulled read-floor raise on the organization returns to the switcher with the reason against it', async () => {
	const { startup, journal, standWith } = await running();

	standWith(inWithTwo(acmeUnreadable));
	await startup.applySyncOutcome({
		action: 'none',
		received: true,
		workspaceId: 'north',
		heldByVersion: acmeUnreadable
	});

	assert.equal(startup.snapshot.state, 'sign-in', 'the switcher, on the wall it heads');
	assert.equal(startup.snapshot.organization?.session, null, 'signed out, so the switcher works');
	assert.deepEqual(startup.snapshot.refusals.acme, {
		sentence: 'refused: organizationNewer',
		detail: acmeUnreadable.reason,
		byVersion: true
	});
	assert.equal(journal.announced, 0);
	assert.deepEqual(journal.failures, []);
});

test('a dispatch that threw for the version is routed the same way, by its refusal code', async () => {
	const { startup, journal } = await running();

	await startup.applySyncOutcome({
		action: 'error',
		received: false,
		workspaceId: 'north',
		heldByVersion: null,
		refusal: 'workspaceNewer'
	});

	assert.equal(startup.snapshot.state, 'held');
	assert.equal(startup.snapshot.held?.workspaceId, 'north');
	assert.equal(journal.announced, 0);
});

test('and one that threw for anything else changes nothing about where the person stands', async () => {
	const { startup } = await running();

	await startup.applySyncOutcome({
		action: 'error',
		received: false,
		workspaceId: 'north',
		heldByVersion: null,
		refusal: 'forbidden'
	});

	assert.equal(startup.snapshot.state, 'ready');
	assert.deepEqual(startup.snapshot.refusals, {});
});
