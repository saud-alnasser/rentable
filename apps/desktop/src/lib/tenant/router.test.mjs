import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, seedTenant, unusedId } from '$lib/api/testing.mjs';
import { isRecordId } from '$lib/platform/database/identity.ts';

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
	assert.ok(isRecordId(tenant.id));
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

test('an identity number padded with non-whitespace characters is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: `!${NATIONAL_ID}!`, phone: PHONE }),
		/must start with 1 or 2/
	);
});

test('an identity number embedded in a longer string is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.tenant.create({
				name: 'Sara',
				nationalId: `hello ${NATIONAL_ID} world`,
				phone: PHONE
			}),
		/must start with 1 or 2/
	);
});

test('an identity number surrounded by whitespace is accepted and stored without it', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({
		name: 'Sara',
		nationalId: `  ${NATIONAL_ID}  `,
		phone: PHONE
	});

	assert.equal(tenant.nationalId, NATIONAL_ID);
});

test('a tenant holding a padded identity can be saved without editing that field', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({
		name: 'Sara',
		nationalId: ` ${NATIONAL_ID} `,
		phone: PHONE
	});

	const updated = await api.tenant.update({
		id: tenant.id,
		name: 'Sara Al-Otaibi',
		nationalId: ` ${NATIONAL_ID} `
	});

	assert.equal(updated.name, 'Sara Al-Otaibi');
	assert.equal(updated.nationalId, NATIONAL_ID);
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

test('an id-only update is a no-op that returns the tenant unchanged', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({ id: tenant.id });

	assert.deepEqual(updated, tenant);
});

// This asserted the opposite until 2026-08-18: the read-back had no row to return, and nothing
// said so. An update that quietly answers with nothing reads at every call site as success, which
// is survivable only while this machine is the only writer — [[rules/data]], under *Undo*, is
// where the reasoning is, and an inverse is the caller that meets it first.
test('an id-only update for a tenant that does not exist says so rather than answering with nothing', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.update({ id: unusedId() }),
		/this tenant is no longer in the workspace/
	);
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

// --- The directory list -------------------------------------------------------------
//
// `getMany` answers the tenants list, which reads as a directory: the order is the
// reader's, and the figure per contract status is an aggregate on the same query. Both are
// asserted here because both are what the list may not redo on the client.

async function seedContract(api, tenantId, overrides = {}) {
	return api.contract.create({
		tenantId,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		...overrides
	});
}

/** the six figures off a listed row, named by status so a mis-keyed one reads as one. */
const statusCounts = (listed) => ({
	scheduled: listed.contractsScheduled,
	active: listed.contractsActive,
	fulfilled: listed.contractsFulfilled,
	defaulted: listed.contractsDefaulted,
	expired: listed.contractsExpired,
	terminated: listed.contractsTerminated
});

test('a tenant with no contracts is listed with a zero against every status', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const [listed] = await api.tenant.getMany({});

	assert.equal(listed.id, tenant.id);
	assert.deepEqual(statusCounts(listed), {
		scheduled: 0,
		active: 0,
		fulfilled: 0,
		defaulted: 0,
		expired: 0,
		terminated: 0
	});
});

test('a row carries one figure per status, and each counts only its own', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	// one contract in each of the six statuses. A tenant holding exactly one everywhere is what
	// makes a conditional count wired to the wrong status show up as a figure in the wrong
	// column rather than as a total that still happens to add up.
	await seedContract(api, tenant.id);

	const fulfilled = await seedContract(api, tenant.id);
	await api.contract.payments.create({
		contractId: fulfilled.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	await seedContract(api, tenant.id, { start: monthsFromNow(-14), end: monthsFromNow(-2) });

	const expired = await seedContract(api, tenant.id, {
		start: monthsFromNow(-14),
		end: monthsFromNow(-2)
	});
	await api.contract.payments.create({
		contractId: expired.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	await seedContract(api, tenant.id, { start: monthsFromNow(2), end: monthsFromNow(14) });

	const terminated = await seedContract(api, tenant.id);
	await api.contract.terminate({ id: terminated.id });

	const [listed] = await api.tenant.getMany({});

	assert.deepEqual(statusCounts(listed), {
		scheduled: 1,
		active: 1,
		fulfilled: 1,
		defaulted: 1,
		expired: 1,
		terminated: 1
	});
});

test('ordering by contracts counts the ones in force, not every contract held', async () => {
	const api = await createApi();
	const inForce = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const history = await api.tenant.create({
		name: 'Zaid',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// two in force against three that are not, so an order over every contract would invert this
	// and an order over the contracts in force will not.
	await seedContract(api, inForce.id);
	const fulfilled = await seedContract(api, inForce.id);
	await api.contract.payments.create({
		contractId: fulfilled.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	await seedContract(api, history.id, { start: monthsFromNow(-14), end: monthsFromNow(-2) });
	await seedContract(api, history.id, { start: monthsFromNow(2), end: monthsFromNow(14) });
	const terminated = await seedContract(api, history.id);
	await api.contract.terminate({ id: terminated.id });

	assert.deepEqual(
		(
			await api.tenant.getMany({ sort: { columnId: 'activeContractCount', direction: 'desc' } })
		).map((tenant) => tenant.id),
		[inForce.id, history.id]
	);
});

test('the directory opens ordered by name', async () => {
	const api = await createApi();
	const zaid = await seedTenant(api);
	const amal = await seedTenant(api);

	await api.tenant.update({ id: zaid.id, name: 'Zaid' });
	await api.tenant.update({ id: amal.id, name: 'Amal' });

	assert.deepEqual(
		(await api.tenant.getMany({})).map((tenant) => tenant.name),
		['Amal', 'Zaid']
	);
});

test('the directory orders by every key the sort control offers', async () => {
	const api = await createApi();
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	await seedContract(api, zaid.id);

	const orderBy = async (columnId, direction) =>
		(await api.tenant.getMany({ sort: { columnId, direction } })).map((tenant) => tenant.id);

	assert.deepEqual(await orderBy('name', 'asc'), [amal.id, zaid.id]);
	assert.deepEqual(await orderBy('name', 'desc'), [zaid.id, amal.id]);
	assert.deepEqual(await orderBy('nationalId', 'asc'), [zaid.id, amal.id]);
	assert.deepEqual(await orderBy('nationalId', 'desc'), [amal.id, zaid.id]);
	assert.deepEqual(await orderBy('activeContractCount', 'asc'), [amal.id, zaid.id]);
	assert.deepEqual(await orderBy('activeContractCount', 'desc'), [zaid.id, amal.id]);
});

test('tenants tied on the chosen order fall back to the directory order', async () => {
	const api = await createApi();
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// created Zaid first, so an id tie-break would put him first and a name one would not.
	await seedContract(api, zaid.id);
	await seedContract(api, amal.id);

	assert.deepEqual(
		(
			await api.tenant.getMany({ sort: { columnId: 'activeContractCount', direction: 'desc' } })
		).map((tenant) => tenant.name),
		['Amal', 'Zaid']
	);
});

test('the directory refuses to order by a column the control does not offer', async () => {
	const api = await createApi();

	await assert.rejects(() => api.tenant.getMany({ sort: { columnId: 'phone', direction: 'asc' } }));
});

test('searching the directory narrows it and keeps the chosen order', async () => {
	const api = await createApi();
	const amal = await api.tenant.create({
		name: 'Amal Odeh',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const zaid = await api.tenant.create({
		name: 'Zaid Odeh',
		nationalId: '1000000001',
		phone: '+966551110002'
	});
	await api.tenant.create({ name: 'Rana Saleh', nationalId: '1000000002', phone: '+966551110003' });

	await seedContract(api, zaid.id);

	const listed = await api.tenant.getMany({
		search: 'Odeh',
		sort: { columnId: 'activeContractCount', direction: 'desc' }
	});

	assert.deepEqual(
		listed.map((tenant) => tenant.id),
		[zaid.id, amal.id]
	);
	assert.deepEqual(
		listed.map((tenant) => tenant.contractsActive),
		[1, 0]
	);
});

test('searching the directory reaches the national id and the phone', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	await api.tenant.create({ name: 'Rana', nationalId: '1000000002', phone: '+966551110003' });

	for (const term of ['2999999999', '+966551110001', 'Amal']) {
		assert.deepEqual(
			(await api.tenant.getMany({ search: term })).map((candidate) => candidate.id),
			[tenant.id],
			`search term ${term}`
		);
	}
});

// --- Palette search -------------------------------------------------------------------

test('a tenant is found by name, identity or phone', async () => {
	const api = await createApi();
	const sara = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	await api.tenant.create({ name: 'Omar', nationalId: IQAMA, phone: '+966559999999' });

	for (const term of ['Sar', NATIONAL_ID.slice(0, 5), PHONE.slice(0, 8)]) {
		assert.deepEqual(
			(await api.tenant.search({ term })).map((match) => match.id),
			[sara.id],
			`expected "${term}" to reach the tenant`
		);
	}
});

// arabic is not a second-class locale: a name stored in it has to be reachable by typing it.
test('a tenant named in arabic is found by an arabic term', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'سارة الأحمد',
		nationalId: NATIONAL_ID,
		phone: PHONE
	});

	assert.deepEqual(
		(await api.tenant.search({ term: 'سارة' })).map((match) => match.id),
		[tenant.id]
	);
});

test('a search answers at most the number of records it was asked for', async () => {
	const api = await createApi();
	for (let index = 0; index < 4; index += 1) await seedTenant(api);

	assert.equal((await api.tenant.search({ term: 'Tenant', limit: 2 })).length, 2);
});
