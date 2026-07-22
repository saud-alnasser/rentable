import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryDatabase } from '../database/memory.ts';
import { appRouter } from '../router.ts';
import { caller, context } from '../trpc.ts';

// A fixed instant (the real "now"), so status derivation is pinned identically whether it
// reads the clock ambiently today or from the injected context later. Contract dates are
// expressed relative to it.
const NOW = Date.now();

function monthsFromNow(months, days = 0) {
	const base = new Date(NOW);
	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate() + days);
}

async function createApi() {
	const db = createMemoryDatabase();
	const ctx = await context({ db, clock: { now: () => NOW }, host: {} });

	return caller(appRouter)(ctx);
}

let seq = 0;

function nextSuffix() {
	seq += 1;
	return String(seq).padStart(4, '0');
}

async function seedTenant(api) {
	const suffix = nextSuffix();

	return api.tenant.create({
		name: `Tenant ${suffix}`,
		nationalId: `1000${suffix}00`.slice(0, 10),
		phone: `+96655${suffix}000`.slice(0, 13)
	});
}

async function seedActiveContract(api) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
}

async function readUnit(api, id) {
	const [unit] = await api.complex.units.get({ id });

	return unit;
}

// --- Complex -------------------------------------------------------------------------

test('creating a complex returns it with its fields', async () => {
	const api = await createApi();

	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	assert.equal(complex.name, 'Palm Court');
	assert.equal(complex.location, 'Riyadh');
	assert.ok(complex.id > 0);
});

test('creating a complex with a duplicate name is rejected', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	await assert.rejects(
		() => api.complex.create({ name: 'Palm Court', location: 'Jeddah' }),
		/name is associated with a previously registered complex/
	);
});

test('updating a complex changes its fields', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const updated = await api.complex.update({
		id: complex.id,
		name: 'Palm Gardens',
		location: 'Dammam'
	});

	assert.equal(updated.name, 'Palm Gardens');
	assert.equal(updated.location, 'Dammam');
});

test('updating a complex to a name used by another complex is rejected', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const second = await api.complex.create({ name: 'Cedar Court', location: 'Jeddah' });

	await assert.rejects(
		() => api.complex.update({ id: second.id, name: 'Palm Court', location: 'Jeddah' }),
		/name is associated with a previously registered complex/
	);
});

test('deleting an empty complex removes it', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	await api.complex.delete({ id: complex.id });

	const found = await api.complex.get({ id: complex.id });
	assert.equal(found, undefined);
});

test('deleting a complex that still has units is rejected', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });

	await assert.rejects(
		() => api.complex.delete({ id: complex.id }),
		/cannot delete complex with associated units/
	);
});

// --- Unit ----------------------------------------------------------------------------

test('creating a unit returns it and starts vacant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	assert.equal(unit.name, 'A1');
	assert.equal(unit.complexId, complex.id);
	assert.equal(unit.status, 'vacant');
});

test('creating a unit with a duplicate name in the same complex is rejected', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });

	await assert.rejects(
		() => api.complex.units.create({ name: 'A1', complexId: complex.id }),
		/name is associated with a unit in the same complex/
	);
});

test('the same unit name is allowed in a different complex', async () => {
	const api = await createApi();
	const first = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const second = await api.complex.create({ name: 'Cedar Court', location: 'Jeddah' });
	await api.complex.units.create({ name: 'A1', complexId: first.id });

	const unit = await api.complex.units.create({ name: 'A1', complexId: second.id });
	assert.equal(unit.complexId, second.id);
});

test('updating a unit changes its name', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	const updated = await api.complex.units.update({
		id: unit.id,
		complexId: complex.id,
		name: 'A2'
	});

	assert.equal(updated.name, 'A2');
});

test('updating a unit accepts a stored status, but the read status stays derived', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const created = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	// the update writes and returns the authored status even though status is meant to be
	// derived, never authored — pinned as observed.
	const updated = await api.complex.units.update({
		id: created.id,
		complexId: complex.id,
		status: 'occupied'
	});
	assert.equal(updated.status, 'occupied');

	// but a read derives the status from assignments and ignores the authored value.
	const read = await readUnit(api, created.id);
	assert.equal(read.status, 'vacant');
});

test('updating a unit to a name used by another unit in the complex is rejected', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'A2', complexId: complex.id });

	await assert.rejects(
		() => api.complex.units.update({ id: second.id, complexId: complex.id, name: 'A1' }),
		/name is associated with a unit in the same complex/
	);
});

test('deleting an unassigned unit removes it', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	await api.complex.units.delete({ id: unit.id });

	const units = await api.complex.units.getMany({ complexId: complex.id });
	assert.equal(units.length, 0);
});

test('deleting a unit assigned to a contract is rejected', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const contract = await seedActiveContract(api);
	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [unit.id]
	});

	await assert.rejects(
		() => api.complex.units.delete({ id: unit.id }),
		/cannot delete unit with associated contracts/
	);
});

// --- Derived unit status -------------------------------------------------------------
//
// This pins the complex router's copy of the unit-status derivation (one of the duplicated
// sites) AS OBSERVED. A unit is `occupied` only while a non-terminated contract's period
// covers today; otherwise `vacant`.

test('an unassigned unit is vacant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const created = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	const unit = await readUnit(api, created.id);
	assert.equal(unit.status, 'vacant');
});

test('a unit assigned to a current contract is occupied', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const created = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const contract = await seedActiveContract(api);
	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [created.id]
	});

	const unit = await readUnit(api, created.id);
	assert.equal(unit.status, 'occupied');
});

test('a unit assigned only to a future (scheduled) contract is vacant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const created = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(2),
		end: monthsFromNow(14),
		interval: '12m',
		cost: 1000
	});
	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [created.id]
	});

	const unit = await readUnit(api, created.id);
	assert.equal(unit.status, 'vacant');
});

test('a unit becomes vacant again once its contract is terminated', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const created = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const contract = await seedActiveContract(api);
	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [created.id]
	});
	await api.contract.terminate({ id: contract.id });

	const unit = await readUnit(api, created.id);
	assert.equal(unit.status, 'vacant');
});
