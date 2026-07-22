import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, seedTenant } from '../testing.mjs';

const NATIONAL_ID = '1234567890';
const IQAMA = '2345678901';
const PHONE = '+966551234567';

// --- Creation ------------------------------------------------------------------------

test('creating a tenant returns it with its fields', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	assert.equal(tenant.name, 'Sara');
	assert.equal(tenant.nationalId, NATIONAL_ID);
	assert.equal(tenant.phone, PHONE);
	assert.ok(tenant.id > 0);
});

// --- Identity-number validation (both accepted document types) -----------------------

test('a national id (prefix 1) is accepted', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	assert.equal(tenant.nationalId, NATIONAL_ID);
});

test('an iqama (prefix 2) is accepted', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({ name: 'Omar', nationalId: IQAMA, phone: PHONE });

	assert.equal(tenant.nationalId, IQAMA);
});

test('an identity number with a disallowed prefix is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: '3234567890', phone: PHONE }),
		/must start with 1 or 2/
	);
});

test('an identity number of the wrong length is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: '12345', phone: PHONE }),
		/must start with 1 or 2/
	);
});

// --- Phone validation ----------------------------------------------------------------

test('a phone without the +9665 prefix is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: '0551234567' }),
		/phone must start with \+966/
	);
});

test('a phone of the wrong length is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: '+96655123' }),
		/phone must start with \+966/
	);
});

// --- Uniqueness ----------------------------------------------------------------------

test('creating a tenant with a national id already in use is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	await assert.rejects(
		() => api.tenant.create({ name: 'Omar', nationalId: NATIONAL_ID, phone: '+966551234500' }),
		/national id is associated with a registered tenant/
	);
});

test('creating a tenant with a phone already in use is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	await assert.rejects(
		() => api.tenant.create({ name: 'Omar', nationalId: IQAMA, phone: PHONE }),
		/phone is associated with a registered tenant/
	);
});

// --- Update --------------------------------------------------------------------------

test('updating a tenant changes its fields', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({
		id: tenant.id,
		name: 'Sara Ali',
		nationalId: NATIONAL_ID,
		phone: PHONE
	});

	assert.equal(updated.name, 'Sara Ali');
});

test('a name-only update succeeds and leaves the identity fields intact', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	// pinned the crash before #135; the partial update the input schema advertises now works.
	const updated = await api.tenant.update({ id: tenant.id, name: 'Sara Ali' });

	assert.equal(updated.name, 'Sara Ali');
	assert.equal(updated.nationalId, NATIONAL_ID);
	assert.equal(updated.phone, PHONE);
});

test('a national-id-only update succeeds and leaves the other fields intact', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({ id: tenant.id, nationalId: IQAMA });

	assert.equal(updated.name, 'Sara');
	assert.equal(updated.nationalId, IQAMA);
	assert.equal(updated.phone, PHONE);
});

test('a phone-only update succeeds and leaves the other fields intact', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({ id: tenant.id, phone: '+966551234500' });

	assert.equal(updated.name, 'Sara');
	assert.equal(updated.nationalId, NATIONAL_ID);
	assert.equal(updated.phone, '+966551234500');
});

test('a partial update to an identity used by another tenant is still rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	const other = await api.tenant.create({
		name: 'Omar',
		nationalId: IQAMA,
		phone: '+966551234500'
	});

	await assert.rejects(
		() => api.tenant.update({ id: other.id, nationalId: NATIONAL_ID }),
		/national id is associated with a registered tenant/
	);
	await assert.rejects(
		() => api.tenant.update({ id: other.id, phone: PHONE }),
		/phone is associated with a registered tenant/
	);
});

test('updating a tenant to a national id used by another tenant is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	const other = await api.tenant.create({
		name: 'Omar',
		nationalId: IQAMA,
		phone: '+966551234500'
	});

	await assert.rejects(
		() =>
			api.tenant.update({
				id: other.id,
				name: 'Omar',
				nationalId: NATIONAL_ID,
				phone: '+966551234500'
			}),
		/national id is associated with a registered tenant/
	);
});

test('updating a tenant to a phone used by another tenant is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	const other = await api.tenant.create({
		name: 'Omar',
		nationalId: IQAMA,
		phone: '+966551234500'
	});

	await assert.rejects(
		() => api.tenant.update({ id: other.id, name: 'Omar', nationalId: IQAMA, phone: PHONE }),
		/phone is associated with a registered tenant/
	);
});

// --- Deletion ------------------------------------------------------------------------

test('deleting a tenant without contracts removes it', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	await api.tenant.delete({ id: tenant.id });

	const found = await api.tenant.get({ id: tenant.id });
	assert.equal(found, undefined);
});

test('deleting a tenant that has a contract is rejected', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);
	await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	await assert.rejects(
		() => api.tenant.delete({ id: tenant.id }),
		/cannot delete tenant with associated contracts/
	);
});
