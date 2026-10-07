import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';

import { createApiWithoutUniqueRules, monthsFromNow } from '$lib/app/tests/testing.ts';
import { seedContract } from '$lib/contract/tests/seed.ts';

// --- A retired payment is never read, and never counted ---------------------------------------
//
// Effort 857, requirement 14, ticket 35: two machines saving one contract with the same payment
// while apart heal into one contract holding that payment once. The other payment stays in its
// table, retired into the one that stayed, and every read of a payment keeps it out: the ledger,
// a record by its id, and the reconcile that sums what a contract was paid.

async function withRetiredCopy() {
	const { api, db } = await createApiWithoutUniqueRules();
	const contract = await seedContract(api, { govId: 'GOV-1' });
	const kept = await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});
	const row = await db.select().from(s.payment).where(eq(s.payment.id, kept.id)).get();
	const retired = newId();

	assert.ok(row);
	await db.insert(s.payment).values({ ...row, id: retired, mergedInto: kept.id });

	return { api, db, contract, kept, retired };
}

test('a retired payment is in no ledger and no read by its id', async () => {
	const { api, contract, kept, retired } = await withRetiredCopy();

	assert.deepEqual(
		(await api.payment.getMany({ contractId: contract.id })).map((payment) => payment.id),
		[kept.id]
	);
	assert.equal(await api.payment.get({ id: retired }), undefined);
});

test('the reconcile counts a payment the copies both held once', async () => {
	const { api, contract } = await withRetiredCopy();

	await api.contract.reconcile();

	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 500);
});
