import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, seedTenant } from '$lib/api/tests/testing.ts';
import { isRecordId } from '$lib/platform/database/identity.ts';

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
	const unit = await api.complex.units.get({ id });

	return unit;
}

// --- Complex -------------------------------------------------------------------------

test('creating a complex returns it with its fields', async () => {
	const api = await createApi();

	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	assert.equal(complex.name, 'Palm Court');
	assert.equal(complex.location, 'Riyadh');
	assert.ok(isRecordId(complex.id));
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

test('a location-only update succeeds and leaves the name intact', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	// crashed on the unguarded name uniqueness check before #135.
	const updated = await api.complex.update({ id: complex.id, location: 'Dammam' });

	assert.equal(updated.name, 'Palm Court');
	assert.equal(updated.location, 'Dammam');
});

test('an id-only update is a no-op that returns the complex unchanged', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const updated = await api.complex.update({ id: complex.id });

	// creation answers with the units it made as well, so the row is compared rather than the
	// whole answer.
	const { units, ...row } = complex;

	assert.deepEqual(units, []);
	assert.deepEqual(updated, row);
});

test('a name-only update to a name used by another complex is still rejected', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const second = await api.complex.create({ name: 'Cedar Court', location: 'Jeddah' });

	await assert.rejects(
		() => api.complex.update({ id: second.id, name: 'Palm Court' }),
		/name is associated with a previously registered complex/
	);
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

// the unit's identity is the pair, so its empty partial carries `complexId` too.
test('an update carrying only the unit identity is a no-op that returns it unchanged', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	const updated = await api.complex.units.update({ id: unit.id, complexId: complex.id });

	assert.deepEqual(updated, unit);
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

test('updating a unit to an empty name another unit in the complex holds is rejected', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const first = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'A2', complexId: complex.id });
	await api.complex.units.update({ id: first.id, complexId: complex.id, name: '' });

	await assert.rejects(
		() => api.complex.units.update({ id: second.id, complexId: complex.id, name: '' }),
		/name is associated with a unit in the same complex/
	);
});

test('updating a unit to a name held in a different complex succeeds', async () => {
	const api = await createApi();
	const first = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const second = await api.complex.create({ name: 'Cedar Court', location: 'Jeddah' });
	await api.complex.units.create({ name: 'A1', complexId: first.id });
	const unit = await api.complex.units.create({ name: 'B1', complexId: second.id });

	const updated = await api.complex.units.update({
		id: unit.id,
		complexId: second.id,
		name: 'A1'
	});

	assert.equal(updated.name, 'A1');
});

// status is the only other field a unit update can carry, so authoring it is the only way to
// make an update write without naming the unit. That authored-status path is pinned as wrong
// above; this test asserts the name and nothing about the status it had to send.
test('a status-only update succeeds and leaves the unit name intact', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });

	const updated = await api.complex.units.update({
		id: unit.id,
		complexId: complex.id,
		status: 'occupied'
	});

	assert.equal(updated.name, 'A1');
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
	await api.contract.units.set({
		contractId: contract.id,
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
	await api.contract.units.set({
		contractId: contract.id,
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
	await api.contract.units.set({
		contractId: contract.id,
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
	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [created.id]
	});
	await api.contract.terminate({ id: contract.id });

	const unit = await readUnit(api, created.id);
	assert.equal(unit.status, 'vacant');
});

// --- The complexes directory ---------------------------------------------------------
//
// `getMany` answers the complexes list, which reads as a directory: the order is the
// reader's, and the unit and vacant counts are aggregates on the same query. Both are
// asserted here because both are what the list may not redo on the client.

async function seedOccupiedUnit(api, complexId, name) {
	const unit = await api.complex.units.create({ name, complexId });
	const contract = await seedActiveContract(api);
	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	return unit;
}

test('a complex is listed with how many units it holds and how many stand vacant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await seedOccupiedUnit(api, complex.id, 'A1');
	await api.complex.units.create({ name: 'A2', complexId: complex.id });
	await api.complex.units.create({ name: 'A3', complexId: complex.id });

	const [listed] = await api.complex.getMany({});

	assert.equal(listed.unitCount, 3);
	assert.equal(listed.vacantUnitCount, 2);
});

test('a complex with no units is listed with counts of zero rather than omitted', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const [listed] = await api.complex.getMany({});

	assert.equal(listed.id, complex.id);
	assert.equal(listed.unitCount, 0);
	assert.equal(listed.vacantUnitCount, 0);
});

test('the directory opens ordered by name', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Zahra Towers', location: 'Riyadh' });
	await api.complex.create({ name: 'Amber Court', location: 'Jeddah' });

	assert.deepEqual(
		(await api.complex.getMany({})).map((complex) => complex.name),
		['Amber Court', 'Zahra Towers']
	);
});

test('the directory orders by every key the sort control offers', async () => {
	const api = await createApi();
	const amber = await api.complex.create({ name: 'Amber Court', location: 'Riyadh' });
	const zahra = await api.complex.create({ name: 'Zahra Towers', location: 'Jeddah' });

	await api.complex.units.create({ name: 'A1', complexId: amber.id });
	await api.complex.units.create({ name: 'A2', complexId: amber.id });
	await seedOccupiedUnit(api, zahra.id, 'B1');

	const orderBy = async (columnId, direction) =>
		(await api.complex.getMany({ sort: { columnId, direction } })).map((complex) => complex.id);

	assert.deepEqual(await orderBy('name', 'asc'), [amber.id, zahra.id]);
	assert.deepEqual(await orderBy('name', 'desc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('location', 'asc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('location', 'desc'), [amber.id, zahra.id]);
	assert.deepEqual(await orderBy('unitCount', 'asc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('unitCount', 'desc'), [amber.id, zahra.id]);
	assert.deepEqual(await orderBy('vacantUnitCount', 'asc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('vacantUnitCount', 'desc'), [amber.id, zahra.id]);
});

test('complexes tied on the chosen order fall back to the directory order', async () => {
	const api = await createApi();
	// created Zahra first, so an id tie-break would put it first and a name one would not.
	const zahra = await api.complex.create({ name: 'Zahra Towers', location: 'Riyadh' });
	const amber = await api.complex.create({ name: 'Amber Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'B1', complexId: zahra.id });
	await api.complex.units.create({ name: 'A1', complexId: amber.id });

	assert.deepEqual(
		(await api.complex.getMany({ sort: { columnId: 'unitCount', direction: 'desc' } })).map(
			(complex) => complex.name
		),
		['Amber Court', 'Zahra Towers']
	);
});

test('the directory refuses to order by a column the control does not offer', async () => {
	const api = await createApi();

	await assert.rejects(() => api.complex.getMany({ sort: { columnId: 'id', direction: 'asc' } }));
});

test('searching the directory narrows it by name and by location', async () => {
	const api = await createApi();
	const amber = await api.complex.create({ name: 'Amber Court', location: 'Riyadh' });
	const zahra = await api.complex.create({ name: 'Zahra Towers', location: 'Riyadh' });
	await api.complex.create({ name: 'Coral Bay', location: 'Jeddah' });
	await api.complex.units.create({ name: 'B1', complexId: zahra.id });

	const byLocation = await api.complex.getMany({
		search: 'Riyadh',
		sort: { columnId: 'unitCount', direction: 'desc' }
	});

	assert.deepEqual(
		byLocation.map((complex) => complex.id),
		[zahra.id, amber.id]
	);
	assert.deepEqual(
		(await api.complex.getMany({ search: 'Coral' })).map((complex) => complex.name),
		['Coral Bay']
	);
});

// --- The occupancy board -------------------------------------------------------------
//
// `units.getMany` answers the board inside a complex: every unit of the complex, in the
// board's own order, each carrying the tenant occupying it.

test('an occupied unit names the tenant occupying it', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});

	const [listed] = await api.complex.units.getMany({ complexId: complex.id });

	assert.equal(listed.status, 'occupied');
	assert.equal(listed.tenantName, tenant.name);
});

test('a vacant unit names no tenant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });

	const [listed] = await api.complex.units.getMany({ complexId: complex.id });

	assert.equal(listed.status, 'vacant');
	assert.equal(listed.tenantName, null);
});

test('a unit whose contract has ended names no tenant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-14),
		end: monthsFromNow(-2),
		interval: '12m',
		cost: 1000
	});
	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});

	const [listed] = await api.complex.units.getMany({ complexId: complex.id });

	assert.equal(listed.status, 'vacant');
	assert.equal(listed.tenantName, null);
});

test('the board is ordered by unit name and holds only its own complex', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const other = await api.complex.create({ name: 'Coral Bay', location: 'Jeddah' });
	await api.complex.units.create({ name: 'B2', complexId: complex.id });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });
	await api.complex.units.create({ name: 'Z9', complexId: other.id });

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.name),
		['A1', 'B2']
	);
});

test('searching the board reaches the unit name and the occupying tenant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const occupied = await api.complex.units.create({ name: 'B2', complexId: complex.id });
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [occupied.id]
	});

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id, search: 'A1' })).map(
			(unit) => unit.name
		),
		['A1']
	);
	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id, search: tenant.name })).map(
			(unit) => unit.name
		),
		['B2']
	);
});

// --- Creating a complex with its units ------------------------------------------------

test('a complex and its units are created in one submission', async () => {
	const api = await createApi();

	const complex = await api.complex.create({
		name: 'Palm Court',
		location: 'Riyadh',
		units: [{ name: 'A1' }, { name: 'A2' }]
	});

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.name),
		['A1', 'A2']
	);
});

test('a complex can still be created with no units', async () => {
	const api = await createApi();

	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	assert.deepEqual(await api.complex.units.getMany({ complexId: complex.id }), []);
});

// a collision one dialog at a time could not produce: each unit was checked against what was
// stored, and there was never a set to check against itself.
test('two units entered under one name are refused, naming the collision', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.complex.create({
				name: 'Palm Court',
				location: 'Riyadh',
				units: [{ name: 'A1' }, { name: ' a1 ' }]
			}),
		/"a1" is used twice/
	);

	assert.deepEqual(await api.complex.getMany({}), []);
});

test('a refused complex name creates none of its units either', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	await assert.rejects(
		() =>
			api.complex.create({
				name: 'Palm Court',
				location: 'Jeddah',
				units: [{ name: 'A1' }]
			}),
		/name is associated with a previously registered complex/
	);

	assert.deepEqual(
		(await api.complex.getMany({})).map((complex) => complex.location),
		['Riyadh']
	);
	assert.equal((await api.complex.getMany({}))[0].unitCount, 0);
});

// --- Palette search -------------------------------------------------------------------

test('a complex is found by name or location, and a unit by either its own name or its complex', async () => {
	const api = await createApi();
	const complex = await api.complex.create({
		name: 'Palm Court',
		location: 'Riyadh',
		units: [{ name: 'A1' }]
	});
	const [unit] = await api.complex.units.getMany({ complexId: complex.id });

	assert.deepEqual(
		(await api.complex.search({ term: 'Riyadh' })).map((match) => match.id),
		[complex.id]
	);
	assert.deepEqual(
		(await api.complex.units.search({ term: 'Palm' })).map((match) => match.id),
		[unit.id]
	);
	assert.equal((await api.complex.units.search({ term: 'A1' }))[0].hint, 'Palm Court');
});

// the palette reaches a unit without first choosing the complex holding it.
test('units are found across every complex at once', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh', units: [{ name: 'Shared' }] });
	await api.complex.create({ name: 'Coral Bay', location: 'Jeddah', units: [{ name: 'Shared' }] });

	assert.equal((await api.complex.units.search({ term: 'Shared' })).length, 2);
});
