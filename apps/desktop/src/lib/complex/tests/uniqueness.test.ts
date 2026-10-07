import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiWithoutUniqueRules, refusalReadIn, refusedWith } from '$lib/app/tests/testing.ts';
import { complexesNamed } from '$lib/complex/complex.ts';

// --- A complex's name, kept unique by the app ------------------------------------------------
//
// Effort 857, requirement 14: the shared database no longer holds a rule on a complex's name, so
// two machines saving one name apart lose no record. A person saving online still meets today's
// words, because the complex's acts read the workspace before they write. Every test here runs
// over a workspace with the rules dropped.

test('creating a complex under a name another holds is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await api.complex.create({ name: 'Al Noor', location: 'Riyadh' });
	const create = () => api.complex.create({ name: 'Al Noor', location: 'Jeddah' });

	await assert.rejects(create, refusedWith('complex.nameTaken'));
	assert.equal(await refusalReadIn(create, 'ar'), 'الاسم مرتبط بمجمع مسجل مسبقاً.');
	assert.equal(
		await refusalReadIn(create, 'en'),
		'name is associated with a previously registered complex.'
	);
	assert.equal((await api.complex.getMany({})).length, 1);
});

test('renaming a complex to another’s name is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await api.complex.create({ name: 'Al Noor', location: 'Riyadh' });
	const other = await api.complex.create({ name: 'Al Waha', location: 'Jeddah' });
	const rename = () => api.complex.update({ id: other.id, name: 'Al Noor' });

	await assert.rejects(rename, refusedWith('complex.nameTaken'));
	assert.equal(await refusalReadIn(rename, 'ar'), 'الاسم مرتبط بمجمع مسجل مسبقاً.');
	assert.equal(
		await refusalReadIn(rename, 'en'),
		'name is associated with a previously registered complex.'
	);
	assert.equal((await api.complex.get({ id: other.id }))?.name, 'Al Waha');
});

test('editing a complex under its own name is not refused', async () => {
	const { api } = await createApiWithoutUniqueRules();
	const complex = await api.complex.create({ name: 'Al Noor', location: 'Riyadh' });

	const updated = await api.complex.update({ id: complex.id, name: 'Al Noor', location: 'Dammam' });

	assert.equal(updated.location, 'Dammam');
});

test('putting complexes back under a name since taken is refused by name', async () => {
	const { api } = await createApiWithoutUniqueRules();
	const complex = await api.complex.create({ name: 'Al Noor', location: 'Riyadh' });
	const deleted = await api.complex.deleteMany({ ids: [complex.id] });

	await api.complex.create({ name: 'Al Noor', location: 'Jeddah' });

	const restore = () => api.complex.createMany({ complexes: deleted.deleted });

	await assert.rejects(restore, refusedWith('complex.nameTakenNamed', { named: 'Al Noor' }));
	// the value named is isolated from the sentence around it, in either language, as `isolateDirection`
	// does for every value a reader did not write in their own direction.
	assert.equal(
		await refusalReadIn(restore, 'ar'),
		'الاسم \u2068Al Noor\u2069 مرتبط بمجمع مسجل مسبقاً.'
	);
	assert.equal(
		await refusalReadIn(restore, 'en'),
		'the name \u2068Al Noor\u2069 is associated with a previously registered complex.'
	);
});

// the one read every check above goes through, so what counts as holding a name is decided in
// one place: a record retired by a merge (ticket 35) is left out there, and no act changes.
test('the complexes holding a name are read in one place, leaving out the one being edited', async () => {
	const { api, db } = await createApiWithoutUniqueRules();
	const held = await api.complex.create({ name: 'Al Noor', location: 'Riyadh' });

	assert.deepEqual(
		(await complexesNamed(db, ['Al Noor', 'Al Waha'])).map((complex) => complex.id),
		[held.id]
	);
	assert.deepEqual(await complexesNamed(db, ['Al Noor'], held.id), []);
	assert.deepEqual(await complexesNamed(db, []), []);
});
