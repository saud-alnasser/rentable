import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	monthsFromNow,
	seedTenant,
	withStatementLog
} from '$lib/api/tests/testing.ts';
import { isRecordId, newId } from '$lib/platform/database/identity.ts';
import type { ComplexSortColumnId } from '$lib/complex/complex.ts';
import type { ListSort } from '@rentable/design/sort.ts';

/** the sort a complexes list may be asked for, as the procedure states it. */
type ComplexSort = NonNullable<NonNullable<Parameters<Api['complex']['getMany']>[0]>['sort']>;

async function seedActiveContract(api: Api) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
}

async function readUnit(api: Api, id: string) {
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
	assert.equal(read?.status, 'vacant');
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
	assert.equal(unit?.status, 'vacant');
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
	assert.equal(unit?.status, 'occupied');
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
	assert.equal(unit?.status, 'vacant');
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
	assert.equal(unit?.status, 'vacant');
});

// --- The complexes directory ---------------------------------------------------------
//
// `getMany` answers the complexes list, which reads as a directory: the order is the
// reader's, and the unit and vacant counts are aggregates on the same query. Both are
// asserted here because both are what the list may not redo on the client.

async function seedOccupiedUnit(api: Api, complexId: string, name: string) {
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

	const orderBy = async (columnId: ComplexSortColumnId, direction: ListSort['direction']) =>
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

	// `id` is outside the sort vocabulary, so it cannot be named in the caller's own type —
	// the vocabulary *is* the type. It arrives here the way a reader's chosen column really
	// does, as the plain string of a `ListSort`, with the vocabulary guard the query layer
	// applies skipped: what is asserted is that the procedure refuses it on its own.
	const chosen: ListSort = { columnId: 'id', direction: 'asc' };

	await assert.rejects(() => api.complex.getMany({ sort: chosen as ComplexSort }));
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

// --- What a selection would do -------------------------------------------------------
//
// The plan and the deletion go through one call, so they cannot answer differently about
// what a refusal is. What they can differ about is the workspace, because another device
// may write between the reader being shown a plan and reaching for the control, and the
// deletion is what is authoritative about that.

/** the identities out of what a multi-record action reported it changed. */
const toIds = (records: readonly { id: string }[]) => records.map((record) => record.id);

let complexSequence = 0;

/** A complex under a name nothing else in the test holds, since the name is unique workspace-wide. */
async function seedComplex(api: Api) {
	complexSequence += 1;

	return api.complex.create({ name: `Complex ${complexSequence}`, location: 'Riyadh' });
}

async function seedComplexHoldingAUnit(api: Api) {
	const complex = await seedComplex(api);

	await api.complex.units.create({ name: 'A1', complexId: complex.id });

	return complex;
}

test('a plan says which complexes in a selection would go through and which would not', async () => {
	const api = await createApi();
	const empty = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);
	const gone = newId();

	const plan = await api.complex.planMany({ ids: [empty.id, held.id, gone] });

	assert.deepEqual(plan.eligible, [empty.id]);
	assert.deepEqual(plan.refused, [
		{ id: held.id, name: held.name, reason: 'holds-units' },
		// nothing survived to name it by, so the count against the reason is what carries it.
		{ id: gone, name: '', reason: 'missing' }
	]);
});

test('asking what a deletion would do writes nothing', async () => {
	const api = await createApi();
	const empty = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);

	await api.complex.planMany({ ids: [empty.id, held.id] });
	await api.complex.units.planMany({
		ids: (await api.complex.units.getMany({ complexId: held.id })).map((unit) => unit.id)
	});

	assert.ok(await api.complex.get({ id: empty.id }));
	assert.ok(await api.complex.get({ id: held.id }));
	assert.equal((await api.complex.units.getMany({ complexId: held.id })).length, 1);
});

// the claim the whole confirmation rests on: what the reader is shown is what the deletion
// then decides, because both are the same call over the same workspace.
test('a plan and the deletion it precedes refuse exactly the same complexes', async () => {
	const api = await createApi();
	const empty = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);
	const gone = newId();
	const ids = [empty.id, held.id, gone];

	const plan = await api.complex.planMany({ ids });
	const result = await api.complex.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [...plan.eligible]);
	assert.deepEqual(result.refused, plan.refused);
	// and every complex named is accounted for on one side or the other: a set that reported
	// neither a deletion nor a refusal for one of them would pass the two lines above.
	assert.deepEqual(
		[...toIds(result.deleted), ...result.refused.map((refusal) => refusal.id)].sort(),
		[...ids].sort()
	);
});

// the plan is what the reader agreed to, and the deletion is what happened. Where the
// workspace moved in between, the second is the answer.
test('what the deletion refuses is what happened, not what the plan showed', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);
	const ids = [first.id, second.id];

	const plan = await api.complex.planMany({ ids });
	assert.deepEqual([...plan.eligible].sort(), [...ids].sort());

	// somebody else puts a unit in the second complex while the confirmation is open.
	await api.complex.units.create({ name: 'A1', complexId: second.id });

	const result = await api.complex.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [first.id]);
	assert.deepEqual(result.refused, [{ id: second.id, name: second.name, reason: 'holds-units' }]);
});

test('several complexes are deleted by one action, and the rest are named', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);

	const result = await api.complex.deleteMany({ ids: [first.id, second.id, held.id] });

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(result.refused, [{ id: held.id, name: held.name, reason: 'holds-units' }]);

	for (const id of [first.id, second.id]) {
		assert.equal(await api.complex.get({ id }), undefined);
	}

	assert.ok(await api.complex.get({ id: held.id }), 'the refused complex is still there');
});

// about cost rather than outcome: a selection is one thing the reader asked for, and issuing
// it as N calls costs a round trip per record for work one statement does. A complex carries
// nothing derived, so there is no reconcile pass here to count.
test('deleting many complexes issues one delete rather than one per record', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedComplex(api)).id);
		}

		drain();

		await api.complex.deleteMany({ ids });
	});

	assert.equal(countMatching(statements, /^\s*delete from "complex"/i), 1);
});

// --- What a selection of units would do ----------------------------------------------

async function seedUnit(api: Api, complexId: string, name: string) {
	return api.complex.units.create({ name, complexId });
}

/** A unit held by a contract that has not started yet: vacant on every screen, and undeletable. */
async function seedUnitUnderAFutureContract(api: Api, complexId: string, name: string) {
	const unit = await seedUnit(api, complexId, name);
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(2),
		end: monthsFromNow(14),
		interval: '12m',
		cost: 1000
	});

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	return unit;
}

// the case acceptance criterion 3a names, and the reason the plan is a query at all: the row
// this unit renders as says `vacant`, and a confirmation built from the rows would have
// offered to delete it.
test('a unit whose only contract is in the future reads as vacant and is still refused', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const free = await seedUnit(api, complex.id, 'A1');
	const future = await seedUnitUnderAFutureContract(api, complex.id, 'A2');

	assert.equal((await readUnit(api, future.id))?.status, 'vacant', 'vacant on the row');

	const plan = await api.complex.units.planMany({ ids: [free.id, future.id] });

	assert.deepEqual(plan.eligible, [free.id]);
	assert.deepEqual(plan.refused, [{ id: future.id, name: future.name, reason: 'holds-contracts' }]);
});

test('a plan and the deletion it precedes refuse exactly the same units', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const free = await seedUnit(api, complex.id, 'A1');
	const future = await seedUnitUnderAFutureContract(api, complex.id, 'A2');
	const gone = newId();
	const ids = [free.id, future.id, gone];

	const plan = await api.complex.units.planMany({ ids });
	const result = await api.complex.units.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [...plan.eligible]);
	assert.deepEqual(result.refused, plan.refused);
	assert.deepEqual(
		[...toIds(result.deleted), ...result.refused.map((refusal) => refusal.id)].sort(),
		[...ids].sort()
	);
});

test('several units are deleted by one action, and the rest are named', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const first = await seedUnit(api, complex.id, 'A1');
	const second = await seedUnit(api, complex.id, 'A2');
	const held = await seedUnitUnderAFutureContract(api, complex.id, 'A3');

	const result = await api.complex.units.deleteMany({ ids: [first.id, second.id, held.id] });

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(result.refused, [{ id: held.id, name: held.name, reason: 'holds-contracts' }]);
	assert.equal(await readUnit(api, first.id), undefined);
	assert.ok(await readUnit(api, held.id), 'the refused unit is still there');
});

// one delete, and no status written: a unit that may be deleted at all was never assigned, so
// nothing derived was resting on it and there is no occupancy to move.
test('deleting many units issues one delete and writes no derived state', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const complex = await api.complex.create({ name: 'Statement Court', location: 'Riyadh' });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedUnit(api, complex.id, `A${index}`)).id);
		}

		drain();

		await api.complex.units.deleteMany({ ids });
	});

	assert.equal(countMatching(statements, /^\s*delete from "unit"/i), 1);
	assert.equal(countMatching(statements, /^\s*update "unit"/i), 0);
	assert.equal(countMatching(statements, /^\s*update "contract"/i), 0);
});

// --- Putting a deleted selection back ------------------------------------------------

test('a deleted selection of complexes is put back whole, each with the identity it had', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);

	const deleted = await api.complex.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.complex.createMany({ complexes: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await api.complex.get({ id: original.id });

		assert.ok(back, 'the complex is there under the identity it had');
		assert.equal(back.name, original.name);
		assert.equal(back.location, original.location);
	}
});

// all or nothing, and the reason: a set half restored is a workspace in a shape neither the
// deletion nor the undo describes. The reader is told which one blocked it, by name.
test('and where one complex cannot be put back, none is', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);

	const deleted = await api.complex.deleteMany({ ids: [first.id, second.id] });

	// somebody registers a complex under a name one of them held while the deletion sits on the
	// undo stack.
	await api.complex.create({ name: second.name, location: 'Jeddah' });

	await assert.rejects(
		() => api.complex.createMany({ complexes: deleted.deleted }),
		new RegExp(`name ${second.name} is associated with a previously registered complex`)
	);

	assert.equal(await api.complex.get({ id: first.id }), undefined);
});

test('and a set of complexes claiming one name twice is refused before anything is written', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);

	const deleted = await api.complex.deleteMany({ ids: [first.id, second.id] });
	const [head, tail] = deleted.deleted;

	await assert.rejects(
		() => api.complex.createMany({ complexes: [head, { ...tail, name: head.name }] }),
		new RegExp(`two complexes in this set claim ${head.name}`)
	);

	assert.equal(await api.complex.get({ id: head.id }), undefined);
});

test('a deleted selection of units is put back vacant, in the complex each was in', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const first = await seedUnit(api, complex.id, 'A1');
	const second = await seedUnit(api, complex.id, 'A2');

	const deleted = await api.complex.units.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.complex.units.createMany({ units: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await readUnit(api, original.id);

		assert.ok(back, 'the unit is there under the identity it had');
		assert.equal(back.name, original.name);
		assert.equal(back.complexId, complex.id);
		assert.equal(back.status, 'vacant');
	}
});

// putting a record back means putting it back as itself. The single-record creation stores a
// name as it was given, so a restore that tidied it would hand back a unit nobody deleted.
test('and a restored unit keeps the name it had, spacing and all', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const padded = await api.complex.units.create({ name: '  A1  ', complexId: complex.id });

	const deleted = await api.complex.units.deleteMany({ ids: [padded.id] });
	await api.complex.units.createMany({ units: deleted.deleted });

	assert.equal((await readUnit(api, padded.id))?.name, '  A1  ');
});

test('and two units in one complex claiming one name are refused before anything is written', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const first = await seedUnit(api, complex.id, 'A1');
	const second = await seedUnit(api, complex.id, 'A2');

	const deleted = await api.complex.units.deleteMany({ ids: [first.id, second.id] });
	const [head, tail] = deleted.deleted;

	await assert.rejects(
		() => api.complex.units.createMany({ units: [head, { ...tail, name: head.name }] }),
		/each unit needs its own name/
	);

	assert.equal(await readUnit(api, head.id), undefined);
});

// A unit's name is unique within the complex holding it rather than across the workspace, so
// the set is weighed per complex on both sides: against itself and against what is already
// there.
//
// The shape is what makes this about the scope of the check. The selection spans two
// complexes, so the workspace read covers both, and one of them still holds an *A1* that was
// never deleted. A check that compared bare names would find that *A1* and refuse to put back
// the *A1* belonging to the other complex.
test('and one name held in another complex is not a collision', async () => {
	const api = await createApi();
	const here = await seedComplex(api);
	const there = await seedComplex(api);
	const mine = await seedUnit(api, here.id, 'A1');
	const neighbour = await seedUnit(api, there.id, 'B1');
	await seedUnit(api, there.id, 'A1');

	const deleted = await api.complex.units.deleteMany({ ids: [mine.id, neighbour.id] });
	const restored = await api.complex.units.createMany({ units: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [mine.id, neighbour.id].sort());
	assert.equal((await readUnit(api, mine.id))?.complexId, here.id);
});

test('and a unit whose name was taken while it was gone blocks the whole set', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);
	const first = await seedUnit(api, complex.id, 'A1');
	const second = await seedUnit(api, complex.id, 'A2');

	const deleted = await api.complex.units.deleteMany({ ids: [first.id, second.id] });

	await api.complex.units.create({ name: 'A2', complexId: complex.id });

	await assert.rejects(
		() => api.complex.units.createMany({ units: deleted.deleted }),
		/name A2 is associated with a unit in the same complex/
	);

	assert.equal(await readUnit(api, first.id), undefined);
});

test('putting a selection of units back asks the workspace once for the whole set', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const complex = await api.complex.create({ name: 'Batch Court', location: 'Riyadh' });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedUnit(api, complex.id, `A${index}`)).id);
		}

		const deleted = await api.complex.units.deleteMany({ ids });

		drain();

		await api.complex.units.createMany({ units: deleted.deleted });
	});

	// three rows go in, and the two questions a unit is unique by are asked once each over the
	// whole set rather than once per record.
	assert.equal(countMatching(statements, /^\s*insert into "unit"/i), 3);
	assert.ok(
		countMatching(statements, /select .* from "unit" where/i) <= 2,
		`one pass per question, not one per row: ${statements.filter((sql) => /select .* from "unit" where/i.test(sql)).length}`
	);
});

// A run of units named on a complex that already exists goes through the same procedure a
// restore does, and this is the case that procedure was not written for: nothing here was ever
// deleted, and every name is arriving for the first time.
test('a run of eighteen units on an existing complex is one call over the whole set', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const complex = await api.complex.create({ name: 'Run Court', location: 'Riyadh' });

		drain();

		const created = await api.complex.units.createMany({
			units: Array.from({ length: 18 }, (_, step) => ({
				name: `A${step + 1}`,
				complexId: complex.id
			}))
		});

		assert.equal(created.length, 18);
		assert.deepEqual(
			created.map((unit) => unit.name),
			Array.from({ length: 18 }, (_, step) => `A${step + 1}`)
		);
		assert.ok(
			created.every((unit) => unit.status === 'vacant'),
			'a unit nobody has taken starts vacant'
		);
	});

	// eighteen rows go down together, and the two questions a unit is unique by are asked once
	// each over the whole set rather than once per unit.
	assert.equal(countMatching(statements, /^\s*insert into "unit"/i), 18);
	assert.ok(
		countMatching(statements, /select .* from "unit" where/i) <= 2,
		`one pass per question, not one per row: ${statements.filter((sql) => /select .* from "unit" where/i.test(sql)).length}`
	);
});

// the collision the create-a-complex case cannot have: the complex is already there, and it is
// already holding a name the run wants. The whole run is refused rather than the seventeen that
// would have fitted, because a run half written is a building the reader did not ask for.
test('a run colliding with a unit the complex already holds writes none of it', async () => {
	const api = await createApi();
	const complex = await seedComplex(api);

	await seedUnit(api, complex.id, 'A3');

	await assert.rejects(
		() =>
			api.complex.units.createMany({
				units: ['A1', 'A2', 'A3', 'A4'].map((name) => ({ name, complexId: complex.id }))
			}),
		/name A3 is associated with a unit in the same complex/
	);

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.name),
		['A3'],
		'nothing was written beside the unit that was already there'
	);
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
