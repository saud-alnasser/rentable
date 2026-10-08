import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import * as s from '$lib/platform/database/schema';

import { createApiWithoutUniqueRules, refusalReadIn, refusedWith } from '$lib/app/tests/testing.ts';
import { tenantsHolding } from '$lib/tenant/tenant.ts';

// --- A tenant's phone and national ID, kept unique by the app --------------------------------
//
// Effort 857, requirement 14: the shared database no longer holds a rule on either field, so
// two machines saving one value apart lose no record. A person saving online still meets
// today's words, because the tenant's acts read the workspace before they write. Every test
// here runs over a workspace with the rules dropped.

const HELD = { name: 'Sara', nationalId: '1234567890', phone: '+966551234567' };
const OTHER = { name: 'Huda', nationalId: '2345678901', phone: '+966559876543' };

test('creating a tenant with a national ID another holds is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await api.tenant.create(HELD);
	const create = () => api.tenant.create({ ...OTHER, nationalId: HELD.nationalId });

	await assert.rejects(create, refusedWith('tenant.nationalIdTaken'));
	assert.equal(await refusalReadIn(create, 'ar'), 'الهوية الوطنية مرتبطة بمستأجر مسجل.');
	assert.equal(
		await refusalReadIn(create, 'en'),
		'national ID is associated with a registered tenant.'
	);
	assert.equal((await api.tenant.getMany({})).length, 1);
});

test('creating a tenant with a phone another holds is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await api.tenant.create(HELD);
	const create = () => api.tenant.create({ ...OTHER, phone: HELD.phone });

	await assert.rejects(create, refusedWith('tenant.phoneTaken'));
	assert.equal(await refusalReadIn(create, 'ar'), 'رقم الهاتف مرتبط بمستأجر مسجل.');
	assert.equal(await refusalReadIn(create, 'en'), 'phone is associated with a registered tenant.');
	assert.equal((await api.tenant.getMany({})).length, 1);
});

test('editing a tenant to another’s national ID or phone is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await api.tenant.create(HELD);
	const other = await api.tenant.create(OTHER);
	const toNationalId = () => api.tenant.update({ id: other.id, nationalId: HELD.nationalId });
	const toPhone = () => api.tenant.update({ id: other.id, phone: HELD.phone });

	await assert.rejects(toNationalId, refusedWith('tenant.nationalIdTaken'));
	assert.equal(await refusalReadIn(toNationalId, 'ar'), 'الهوية الوطنية مرتبطة بمستأجر مسجل.');
	assert.equal(
		await refusalReadIn(toNationalId, 'en'),
		'national ID is associated with a registered tenant.'
	);

	await assert.rejects(toPhone, refusedWith('tenant.phoneTaken'));
	assert.equal(await refusalReadIn(toPhone, 'ar'), 'رقم الهاتف مرتبط بمستأجر مسجل.');
	assert.equal(await refusalReadIn(toPhone, 'en'), 'phone is associated with a registered tenant.');

	const unchanged = await api.tenant.get({ id: other.id });

	assert.equal(unchanged?.nationalId, OTHER.nationalId);
	assert.equal(unchanged?.phone, OTHER.phone);
});

test('editing a tenant to its own national ID and phone is not refused', async () => {
	const { api } = await createApiWithoutUniqueRules();
	const tenant = await api.tenant.create(HELD);

	const updated = await api.tenant.update({
		id: tenant.id,
		name: 'Sara A.',
		nationalId: HELD.nationalId,
		phone: HELD.phone
	});

	assert.equal(updated.name, 'Sara A.');
});

test('putting tenants back over a national ID or phone since taken is refused by name', async () => {
	const { api } = await createApiWithoutUniqueRules();
	const first = await api.tenant.create(HELD);
	const deleted = await api.tenant.deleteMany({ ids: [first.id] });

	await api.tenant.create({ ...OTHER, nationalId: HELD.nationalId });

	const restoreByIdentity = () => api.tenant.createMany({ tenants: deleted.deleted });

	await assert.rejects(
		restoreByIdentity,
		refusedWith('tenant.nationalIdTakenNamed', { named: HELD.nationalId })
	);
	// the value named is isolated from the sentence around it, in either language, as `isolateDirection`
	// does for every value a reader did not write in their own direction.
	assert.equal(
		await refusalReadIn(restoreByIdentity, 'ar'),
		`الهوية الوطنية \u2068${HELD.nationalId}\u2069 مرتبطة بمستأجر مسجل.`
	);
	assert.equal(
		await refusalReadIn(restoreByIdentity, 'en'),
		`national ID \u2068${HELD.nationalId}\u2069 is associated with a registered tenant.`
	);

	const { api: second } = await createApiWithoutUniqueRules();
	const back = await second.tenant.create(HELD);
	const removed = await second.tenant.deleteMany({ ids: [back.id] });

	await second.tenant.create({ ...OTHER, phone: HELD.phone });

	const restoreByPhone = () => second.tenant.createMany({ tenants: removed.deleted });

	await assert.rejects(
		restoreByPhone,
		refusedWith('tenant.phoneTakenNamed', { named: HELD.phone })
	);
	assert.equal(
		await refusalReadIn(restoreByPhone, 'ar'),
		`رقم الهاتف \u2068${HELD.phone}\u2069 مرتبط بمستأجر مسجل.`
	);
	assert.equal(
		await refusalReadIn(restoreByPhone, 'en'),
		`phone \u2068${HELD.phone}\u2069 is associated with a registered tenant.`
	);
});

// the one read every check above goes through, so what counts as holding a value is decided in
// one place: a record retired by a merge (ticket 35) is left out there, and no act changes.
test('the tenants holding a value are read in one place, leaving out the one being edited', async () => {
	const { api, db } = await createApiWithoutUniqueRules();
	const held = await api.tenant.create(HELD);

	assert.deepEqual(
		(await tenantsHolding(db, 'nationalId', [HELD.nationalId])).map((tenant) => tenant.id),
		[held.id]
	);
	assert.deepEqual(
		(await tenantsHolding(db, 'phone', [HELD.phone, OTHER.phone])).map((tenant) => tenant.id),
		[held.id]
	);
	assert.deepEqual(await tenantsHolding(db, 'phone', [HELD.phone], held.id), []);
	assert.deepEqual(await tenantsHolding(db, 'phone', []), []);
});

// two tenants can share a value saved apart on two machines (ticket 38). An edit leaving that
// value alone is not refused over it, and an edit changing a field to a value held is.
test('editing a tenant that shares a value with another, leaving the value alone, saves', async () => {
	const { api, db } = await createApiWithoutUniqueRules();
	await api.tenant.create(HELD);
	const other = await api.tenant.create(OTHER);

	await db
		.update(s.tenant)
		.set({ nationalId: HELD.nationalId, phone: HELD.phone })
		.where(eq(s.tenant.id, other.id));

	const updated = await api.tenant.update({
		id: other.id,
		name: 'Huda A.',
		nationalId: HELD.nationalId,
		phone: HELD.phone
	});

	assert.equal(updated.name, 'Huda A.');

	const toNewPhone = () => api.tenant.update({ id: other.id, phone: '+966550000000' });

	assert.equal((await toNewPhone()).phone, '+966550000000');

	const backToHeld = () => api.tenant.update({ id: other.id, phone: HELD.phone });

	await assert.rejects(backToHeld, refusedWith('tenant.phoneTaken'));
	assert.equal(
		await refusalReadIn(backToHeld, 'en'),
		'phone is associated with a registered tenant.'
	);
});
