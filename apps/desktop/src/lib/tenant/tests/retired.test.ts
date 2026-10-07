import assert from 'node:assert/strict';
import test from 'node:test';

import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';

import { createApiWithoutUniqueRules } from '$lib/app/tests/testing.ts';
import { tenantsHolding } from '$lib/tenant/tenant.ts';

// --- A retired tenant is never read -----------------------------------------------------------
//
// Effort 857, requirement 14, ticket 35: the pass after a pull retires a tenant two machines made
// apart as an exact copy of an earlier one, and leaves it in its table. Every read of a tenant
// keeps it out, through the routers and through the save check alike.

const SARA = { name: 'Sara', nationalId: '1234567890', phone: '+966551234567' };

async function withRetiredCopy() {
	const { api, db } = await createApiWithoutUniqueRules();
	const kept = await api.tenant.create(SARA);
	const retired = newId();

	await db.insert(s.tenant).values({ id: retired, ...SARA, mergedInto: kept.id });

	return { api, db, kept, retired };
}

test('a retired tenant is in no list, search or read by its id', async () => {
	const { api, kept, retired } = await withRetiredCopy();

	assert.deepEqual(
		(await api.tenant.getMany({})).map((tenant) => tenant.id),
		[kept.id]
	);
	assert.deepEqual(
		(await api.tenant.search({ term: SARA.name })).map((tenant) => tenant.id),
		[kept.id]
	);
	assert.equal(await api.tenant.get({ id: retired }), undefined);
	assert.equal((await api.tenant.get({ id: kept.id }))?.id, kept.id);
});

test('the save check reads past a retired tenant to the one that stayed', async () => {
	const { api, db, kept } = await withRetiredCopy();

	assert.deepEqual(
		(await tenantsHolding(db, 'phone', [SARA.phone])).map((tenant) => tenant.id),
		[kept.id]
	);

	// a retired copy holding a phone no live tenant holds refuses nobody.
	await db
		.insert(s.tenant)
		.values({ id: newId(), ...SARA, phone: '+966559999999', mergedInto: kept.id });

	const huda = await api.tenant.create({
		name: 'Huda',
		nationalId: '2345678901',
		phone: '+966559999999'
	});

	assert.equal(huda.phone, '+966559999999');
});
