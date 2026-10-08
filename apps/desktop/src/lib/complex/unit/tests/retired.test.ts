import assert from 'node:assert/strict';
import test from 'node:test';

import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';

import { createApiWithoutUniqueRules } from '$lib/app/tests/testing.ts';

// --- A retired unit is never read -------------------------------------------------------------
//
// Effort 857, requirement 14, ticket 35: two machines saving one complex with the same units while
// apart heal into one complex with one set of units. The other set stays in its table, each unit
// retired into the one it matched, and every read of a unit keeps it out.

test('a retired unit is in no list of its complex and no read by its id', async () => {
	const { api, db } = await createApiWithoutUniqueRules();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const kept = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const retired = newId();

	await db.insert(s.unit).values({
		id: retired,
		name: 'A1',
		status: 'vacant',
		complexId: complex.id,
		mergedInto: kept.id
	});

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.id),
		[kept.id]
	);
	assert.equal(await api.complex.units.get({ id: retired }), undefined);
	// and the complex's list counts the one set it holds.
	assert.equal(
		(await api.complex.getMany({})).find((listed) => listed.id === complex.id)?.unitCount,
		1
	);
});
