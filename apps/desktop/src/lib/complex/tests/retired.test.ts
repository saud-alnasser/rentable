import assert from 'node:assert/strict';
import test from 'node:test';

import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';

import { createApiWithoutUniqueRules } from '$lib/app/tests/testing.ts';
import { complexesNamed } from '$lib/complex/complex.ts';

// --- A retired complex is never read ----------------------------------------------------------
//
// Effort 857, requirement 14, ticket 35: the pass after a pull retires a complex two machines
// made apart as an exact copy of an earlier one, and leaves it in its table. Every read of a
// complex keeps it out, through the routers, the unit's reads and the save check alike.

const PALM = { name: 'Palm Court', location: 'Riyadh' };

async function withRetiredCopy() {
	const { api, db } = await createApiWithoutUniqueRules();
	const kept = await api.complex.create(PALM);
	const retired = newId();

	await db.insert(s.complex).values({ id: retired, ...PALM, mergedInto: kept.id });

	return { api, db, kept, retired };
}

test('a retired complex is in no list, search or read by its id', async () => {
	const { api, kept, retired } = await withRetiredCopy();

	assert.deepEqual(
		(await api.complex.getMany({})).map((complex) => complex.id),
		[kept.id]
	);
	assert.deepEqual(
		(await api.complex.search({ term: PALM.name })).map((complex) => complex.id),
		[kept.id]
	);
	assert.equal(await api.complex.get({ id: retired }), undefined);
});

test('a unit left under a retired complex is read under no complex', async () => {
	const { api, db, retired } = await withRetiredCopy();
	const unit = newId();

	// as a machine that had not heard of the merge leaves one, until the next pass moves it.
	await db.insert(s.unit).values({ id: unit, name: 'A1', status: 'vacant', complexId: retired });

	assert.equal(await api.complex.units.get({ id: unit }), undefined);
});

test('the save check reads past a retired complex to the one that stayed', async () => {
	const { api, db, kept } = await withRetiredCopy();

	assert.deepEqual(
		(await complexesNamed(db, [PALM.name])).map((complex) => complex.id),
		[kept.id]
	);

	await db
		.insert(s.complex)
		.values({ id: newId(), name: 'Olaya Court', location: 'Riyadh', mergedInto: kept.id });

	const olaya = await api.complex.create({ name: 'Olaya Court', location: 'Riyadh' });

	assert.equal(olaya.name, 'Olaya Court');
});
