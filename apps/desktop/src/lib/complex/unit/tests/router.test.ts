import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	identityWithout,
	monthsFromNow,
	seedTenant,
	withStatementLog,
	refusedWith
} from '$lib/app/tests/testing.ts';
import { newId } from '$lib/platform/database/identity.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';

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
		refusedWith('unit.nameTaken')
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
		refusedWith('unit.nameTaken')
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
		refusedWith('unit.nameTaken')
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
		refusedWith('unit.holdsContracts')
	);
});

// effort 854, requirement 8: an undo of a creation deletes, and a record somebody else deleted
// first is refused rather than answered with nothing, which read as success.
test('deleting a missing unit is refused', async () => {
	const api = await createApi();

	await assert.rejects(() => api.complex.units.delete({ id: newId() }), refusedWith('unit.gone'));
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

// effort 832, ticket 30: every list sorts, and the unit directory is one of them. The order is
// the one chosen, and its ties fall back to the name.
test('the board orders by what the reader chose, and ties fall back to the name', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'C3', complexId: complex.id });
	const occupied = await api.complex.units.create({ name: 'B2', complexId: complex.id });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
	await api.contract.units.set({ contractId: contract.id, unitIds: [occupied.id] });

	const namesIn = async (columnId: 'name' | 'tenantName' | 'status', direction: 'asc' | 'desc') =>
		(await api.complex.units.getMany({ complexId: complex.id, sort: { columnId, direction } })).map(
			(unit) => unit.name
		);

	assert.deepEqual(await namesIn('name', 'desc'), ['C3', 'B2', 'A1']);
	// the two vacant units name nobody, and are told apart by their names.
	assert.deepEqual(await namesIn('tenantName', 'desc'), ['B2', 'A1', 'C3']);
	assert.deepEqual(await namesIn('status', 'asc'), ['B2', 'A1', 'C3']);
	assert.deepEqual(await namesIn('status', 'desc'), ['A1', 'C3', 'B2']);
});

// --- What a selection of units would do ----------------------------------------------

/** the identities out of what a multi-record action reported it changed. */
const toIds = (records: readonly { id: string }[]) => records.map((record) => record.id);

let complexSequence = 0;

/** A complex under a name nothing else in the test holds, since the name is unique workspace-wide. */
async function seedComplex(api: Api) {
	complexSequence += 1;

	return api.complex.create({ name: `Complex ${complexSequence}`, location: 'Riyadh' });
}

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
		refusedWith('unit.nameRepeated')
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
		refusedWith('unit.nameTakenNamed', { named: 'A2' })
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
		refusedWith('unit.nameTakenNamed', { named: 'A3' })
	);

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.name),
		['A3'],
		'nothing was written beside the unit that was already there'
	);
});

// --- Palette search -------------------------------------------------------------------

// the palette reaches a unit without first choosing the complex holding it.
test('units are found across every complex at once', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh', units: [{ name: 'Shared' }] });
	await api.complex.create({ name: 'Coral Bay', location: 'Jeddah', units: [{ name: 'Shared' }] });

	assert.equal((await api.complex.units.search({ term: 'Shared' })).length, 2);
});

// --- What a member may not view ------------------------------------------------------------
//
// Effort 838, requirement 10: a complex's and a unit's reads leave out every field of a kind the
// member may not view. The same workspace is read by a member holding every record act and by one
// lacking a single view flag.

test('without viewing complexes, a unit and its search name no complex', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const complex = await api.complex.create({ name: 'Al Nakheel', location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: 'A-12', complexId: complex.id });
	const lacking = await createApi({ db, identity: identityWithout('viewComplex') });

	assert.equal((await api.complex.units.get({ id: unit.id }))?.complexName, complex.name);

	const read = await lacking.complex.units.get({ id: unit.id });

	assert.equal(read?.id, unit.id);
	assert.equal(read?.complexId, complex.id);
	assert.equal('complexName' in read!, false);

	assert.deepEqual(await lacking.complex.units.search({ term: 'A-12' }), [
		{ id: unit.id, label: 'A-12', hint: '' }
	]);
	// nor is a unit found by the complex holding it.
	assert.equal((await api.complex.units.search({ term: complex.name })).length, 1);
	assert.deepEqual(await lacking.complex.units.search({ term: complex.name }), []);
});

test('without viewing tenants, a unit row names no occupant and is not found or ordered by one', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const tenant = await seedTenant(api);
	const complex = await api.complex.create({ name: 'Al Nakheel', location: 'Riyadh' });
	const occupied = await api.complex.units.create({ name: 'B-1', complexId: complex.id });
	const vacant = await api.complex.units.create({ name: 'A-1', complexId: complex.id });

	await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		unitIds: [occupied.id]
	});

	const lacking = await createApi({ db, identity: identityWithout('viewTenant') });
	const everything = await api.complex.units.getMany({ complexId: complex.id });

	assert.equal(everything.find((unit) => unit.id === occupied.id)?.tenantName, tenant.name);

	const rows = await lacking.complex.units.getMany({
		complexId: complex.id,
		sort: { columnId: 'tenantName', direction: 'desc' }
	});

	// the directory's own order, by name, rather than one telling whose the unit is.
	assert.deepEqual(
		rows.map((unit) => unit.id),
		[vacant.id, occupied.id]
	);

	for (const row of rows) {
		assert.equal('tenantName' in row, false);
	}

	// the status is the unit's own, and still says it is occupied.
	assert.equal(rows.find((unit) => unit.id === occupied.id)?.status, 'occupied');
	assert.deepEqual(
		await lacking.complex.units.getMany({ complexId: complex.id, search: tenant.name }),
		[]
	);
});
