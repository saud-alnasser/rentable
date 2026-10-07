import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';

import { createApiWithoutUniqueRules } from '$lib/app/tests/testing.ts';
import { contractsHoldingGovId } from '$lib/contract/row.ts';
import { seedComplexWithUnit, seedContract } from '$lib/contract/tests/seed.ts';

// --- A retired contract is never read ---------------------------------------------------------
//
// Effort 857, requirement 14, ticket 35: the pass after a pull retires a contract two machines
// made apart as an exact copy of an earlier one, and leaves it in its table. Every read of a
// contract keeps it out: the directory, the record, the dashboard, the reconcile and the save
// check.

async function withRetiredCopy() {
	const { api, db } = await createApiWithoutUniqueRules();
	const { unit } = await seedComplexWithUnit(api, 'R');
	const kept = await seedContract(api, { govId: 'GOV-1', unitIds: [unit.id] });
	const row = await db.select().from(s.contract).where(eq(s.contract.id, kept.id)).get();
	const retired = newId();

	assert.ok(row);
	await db.insert(s.contract).values({ ...row, id: retired, mergedInto: kept.id });

	return { api, db, kept, retired, unit };
}

test('a retired contract is in no list, search, record or dashboard', async () => {
	const { api, kept, retired } = await withRetiredCopy();

	assert.deepEqual(
		(await api.contract.getMany({})).map((contract) => contract.id),
		[kept.id]
	);
	assert.deepEqual(
		(await api.contract.search({ term: 'GOV-1' })).map((contract) => contract.id),
		[kept.id]
	);
	assert.equal(await api.contract.get({ id: retired }), undefined);

	const { queue } = await api.dashboard.get();

	assert.ok(queue.every((entry) => entry.id !== retired));
});

test('the reconcile neither reads nor writes a retired contract', async () => {
	const { api, db, kept, retired, unit } = await withRetiredCopy();

	// the copy holds the unit too, as a machine that had not heard of the merge left it, and says
	// it is scheduled though it started a month ago: a reconcile that read it would move both.
	await db.insert(s.contractUnit).values({ contractId: retired, unitId: unit.id });
	await db.update(s.contract).set({ status: 'scheduled' }).where(eq(s.contract.id, retired));
	await api.contract.terminate({ id: kept.id });
	await api.contract.reconcile();

	// a write reaches the retired copy by its id, and answers what it holds.
	const [copy] = await db
		.update(s.contract)
		.set({ govId: 'GOV-1' })
		.where(eq(s.contract.id, retired))
		.returning({ status: s.contract.status });

	assert.equal(copy?.status, 'scheduled', 'the reconcile did not write the retired copy');
	assert.equal(
		(await api.complex.units.get({ id: unit.id }))?.status,
		'vacant',
		'the unit the copy holds is not occupied by it'
	);
});

test('the save check reads past a retired contract to the one that stayed', async () => {
	const { api, db, kept } = await withRetiredCopy();

	assert.deepEqual(
		(await contractsHoldingGovId(db, ['GOV-1'])).map((contract) => contract.id),
		[kept.id]
	);

	const row = await db.select().from(s.contract).where(eq(s.contract.id, kept.id)).get();

	assert.ok(row);
	await db.insert(s.contract).values({ ...row, id: newId(), govId: 'GOV-9', mergedInto: kept.id });

	const created = await seedContract(api, { govId: 'GOV-9' });

	assert.equal(created.govId, 'GOV-9');
});
