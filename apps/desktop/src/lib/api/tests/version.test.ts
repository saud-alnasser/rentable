import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILT_IN } from '@rentable/workspace-permission';
import { sql } from 'drizzle-orm';

import type { Host } from '$lib/app/host.ts';
import { appRouter } from '$lib/app/router.ts';
import { fakeHost } from '$lib/app/tests/host.ts';
import { createApi, monthsFromNow, NOW, refusedWith, seedTenant } from '$lib/app/tests/testing.ts';
import { seedContract } from '$lib/contract/tests/seed.ts';
import type { HeldByVersion } from '$lib/organization/host.ts';
import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';
import { caller, context } from '../trpc.ts';

/**
 * A WORKSPACE BELOW ITS WRITE FLOOR, THROUGH THE ROUTERS
 *
 * Effort 857, requirement 6 and criterion 6 (ticket 05): where a newer rentable upgraded the
 * workspace open past what this one writes, every create, edit and delete a router takes is refused
 * with the version as the reason, before it reaches the database, and every read answers as
 * before. The identity is resolved the way the application resolves it, off the shell's state, so
 * the fold in `permissionsIn` is what is tested rather than an identity written to look folded.
 * Rust refuses the same writes at the engine (`database/mod.rs`), and this is the courtesy that
 * names the reason first.
 */

/** a manager holding the workspace south with full access: every record act, by the role. */
const manager = () =>
	fakeOrganizationSession({
		role: 'manager',
		roleId: BUILT_IN.manager.id,
		rank: BUILT_IN.manager.rank,
		permissions: BUILT_IN.manager.mask,
		workspaces: [fakeOrganizationWorkspace({ id: 'south', accessLevel: 'full-access' })]
	});

/** a shell open on south, signed in as the manager, holding `heldByVersion` as its verdicts. */
function shellOnSouth(heldByVersion: HeldByVersion[]): Host {
	const state = fakeOrganizationState({ session: manager(), heldByVersion });

	return fakeHost({
		organization: { ...fakeHost().organization, getState: async () => state },
		sync: {
			...fakeHost().sync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'south' }) })
		}
	});
}

const SOUTH_READ_ONLY: HeldByVersion = {
	target: { workspace: 'south' },
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded south'
};

const ORGANIZATION_READ_ONLY: HeldByVersion = {
	target: 'organization',
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded the organization'
};

/** what each statement issued was, so a test can say nothing was written. */
function writesIn(statements: readonly string[]) {
	return statements.filter((sql) => /^\s*(insert|update|delete|create|drop|alter)\b/i.test(sql));
}

/**
 * A workspace holding a tenant and a contract, written while writable, and a caller over it
 * resolved off a shell holding south below its write floor, with every statement it issues logged.
 * The contract's status is left as another machine might have written it before the day moved on,
 * `scheduled` where its dates say `active`, so a reconcile has something to write.
 */
async function heldOverATenant(held: HeldByVersion[] = [SOUTH_READ_ONLY]) {
	const statements: string[] = [];
	const db = createMemoryDatabase((statement) => statements.push(statement));
	const writable = await createApi({ db });
	const tenant = await seedTenant(writable);
	const contract = await seedContract(writable);

	await db.run(sql`UPDATE contract SET status = 'scheduled' WHERE id = ${contract.id}`);

	const ctx = await context({
		db,
		clock: { now: () => NOW },
		host: shellOnSouth(held)
	});

	statements.length = 0;

	return { api: caller(appRouter)(ctx), tenant, contract, statements, identity: ctx.identity };
}

test('below the write floor a create, an edit and a delete are refused for the version, and nothing is written', async () => {
	const { api, tenant, statements, identity } = await heldOverATenant();

	assert.equal(identity?.readOnlyByVersion, true, 'the identity does not say the version holds it');

	await assert.rejects(
		api.tenant.create({ name: 'another', nationalId: '2000000001', phone: '+966551110000' }),
		refusedWith('host.workspaceReadOnlyByVersion')
	);
	await assert.rejects(
		api.tenant.update({ id: tenant.id, name: 'renamed' }),
		refusedWith('host.workspaceReadOnlyByVersion')
	);
	await assert.rejects(
		api.tenant.delete({ id: tenant.id }),
		refusedWith('host.workspaceReadOnlyByVersion')
	);

	assert.deepEqual(writesIn(statements), [], 'a refused write reached the database');
});

// effort 857, ticket 16: the shell carries the organization's verdict and the workspace's apart, so a
// workspace read-only by version is refused as one even where the organization is read-only too.
test("with the organization read-only too, the workspace's writes are still refused for the version", async () => {
	const { api, tenant, statements, identity } = await heldOverATenant([
		ORGANIZATION_READ_ONLY,
		SOUTH_READ_ONLY
	]);

	assert.equal(identity?.readOnlyByVersion, true, "the workspace's verdict was lost");

	await assert.rejects(
		api.tenant.update({ id: tenant.id, name: 'renamed' }),
		refusedWith('host.workspaceReadOnlyByVersion')
	);
	await assert.rejects(
		api.tenant.delete({ id: tenant.id }),
		refusedWith('host.workspaceReadOnlyByVersion')
	);

	assert.deepEqual(writesIn(statements), [], 'a refused write reached the database');
});

// effort 857, ticket 31: floors that could not be read hold the workspace read-only, and a write
// is refused for the floors rather than for a newer version.
test('a workspace whose floors could not be read refuses writes for the floors, not a version', async () => {
	const { api, tenant, statements, identity } = await heldOverATenant([
		{ ...SOUTH_READ_ONLY, reason: 'workspaceFloorsUnreadable' }
	]);

	assert.equal(identity?.readOnlyByVersion, true);
	assert.equal(identity?.floorsUnreadable, true, 'the identity does not say the floors hold it');

	await assert.rejects(
		api.tenant.update({ id: tenant.id, name: 'renamed' }),
		refusedWith('host.workspaceFloorsUnreadable')
	);

	assert.deepEqual(writesIn(statements), [], 'a refused write reached the database');
});

test('below the write floor every read answers as before', async () => {
	const { api, tenant } = await heldOverATenant();

	assert.equal((await api.tenant.get({ id: tenant.id }))?.name, tenant.name);
	assert.deepEqual(
		(await api.tenant.search({ term: tenant.name })).map((match) => match.id),
		[tenant.id]
	);
});

// the reconcile after a pull and at a day's crossing writes derived columns, and is not a person's
// act: below the write floor it is skipped rather than refused, so neither a launch nor a heartbeat
// fails on it.
test('below the write floor the reconcile writes nothing and does not fail', async () => {
	const { api, contract, statements } = await heldOverATenant();

	const { reconciledAt } = await api.contract.reconcile();

	assert.equal(reconciledAt, NOW);
	assert.deepEqual(writesIn(statements), [], 'the reconcile wrote below the write floor');
	assert.equal((await api.contract.get({ id: contract.id }))?.status, 'scheduled');
});

test('at or above the write floor the same caller writes', async () => {
	const db = createMemoryDatabase();
	const ctx = await context({ db, clock: { now: () => NOW }, host: shellOnSouth([]) });
	const api = caller(appRouter)(ctx);

	assert.equal(ctx.identity?.readOnlyByVersion, undefined);

	const created = await seedTenant(api);
	const contract = await seedContract(api);

	assert.equal((await api.tenant.update({ id: created.id, name: 'renamed' })).name, 'renamed');

	// and the reconcile writes what the other test held back, so that test was not vacuous.
	await db.run(sql`UPDATE contract SET status = 'scheduled' WHERE id = ${contract.id}`);
	await api.contract.reconcile();

	assert.equal((await api.contract.get({ id: contract.id }))?.status, 'active');
});

// effort 861, ticket 12: the link the reconcile recognises is written by the same pass, so below
// the write floor it is held back with the derived columns, and the pair stays as it was.
test('below the write floor the reconcile links no renewal', async () => {
	const statements: string[] = [];
	const db = createMemoryDatabase((statement) => statements.push(statement));
	const writable = await createApi({ db });
	const predecessor = await seedContract(writable, {
		start: monthsFromNow(-13),
		end: monthsFromNow(-1)
	});
	const successor = await writable.contract.create({
		tenantId: predecessor.tenantId,
		start: monthsFromNow(-1, 1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
	const held = caller(appRouter)(
		await context({ db, clock: { now: () => NOW }, host: shellOnSouth([SOUTH_READ_ONLY]) })
	);

	statements.length = 0;
	await held.contract.reconcile();

	assert.deepEqual(writesIn(statements), [], 'the reconcile wrote below the write floor');
	assert.equal((await held.contract.get({ id: successor.id }))?.renewsContractId, null);

	// and the same pair is linked where the caller may write, so the test above was not vacuous.
	await writable.contract.reconcile();

	assert.equal((await held.contract.get({ id: successor.id }))?.renewsContractId, predecessor.id);
});
