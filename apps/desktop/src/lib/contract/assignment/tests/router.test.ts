import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, unusedId, refusedWith } from '$lib/app/tests/testing.ts';
import { seedComplexWithUnit, seedContract } from '$lib/contract/tests/seed.ts';

test('the units free for a term leave out those an overlapping contract holds', async () => {
	const api = await createApi();
	const free = await seedComplexWithUnit(api, 'Term-Free');
	const taken = await seedComplexWithUnit(api, 'Term-Taken');
	const later = await seedComplexWithUnit(api, 'Term-Later');
	const released = await seedComplexWithUnit(api, 'Term-Released');

	await seedContract(api, { unitIds: [taken.unit.id] });
	await seedContract(api, {
		start: monthsFromNow(12),
		end: monthsFromNow(24),
		unitIds: [later.unit.id]
	});

	const terminated = await seedContract(api, { unitIds: [released.unit.id] });

	await api.contract.terminate({ id: terminated.id });

	const offered = await api.contract.units.getAssignableForTerm({
		start: monthsFromNow(-1),
		end: monthsFromNow(11)
	});
	const offeredIds = new Set(offered.map((unit) => unit.id));

	assert.equal(offeredIds.has(free.unit.id), true);
	assert.equal(offeredIds.has(later.unit.id), true, 'a unit held over another term was left out');
	assert.equal(offeredIds.has(released.unit.id), true, 'a terminated contract still held a unit');
	assert.equal(offeredIds.has(taken.unit.id), false, 'a unit held over the term was offered');
});

test('the units free for a term narrow on the unit name and on the complex holding it', async () => {
	const api = await createApi();
	const palm = await seedComplexWithUnit(api, 'Palm');
	await seedComplexWithUnit(api, 'Coral');

	const term = { start: monthsFromNow(-1), end: monthsFromNow(11) };

	assert.deepEqual(
		(await api.contract.units.getAssignableForTerm({ ...term, search: 'palm' })).map(
			(unit) => unit.id
		),
		[palm.unit.id]
	);
	assert.deepEqual(
		(await api.contract.units.getAssignableForTerm({ ...term, search: 'Unit Palm' })).map(
			(unit) => unit.id
		),
		[palm.unit.id]
	);
});

// --- Unit assignment -----------------------------------------------------------------

test('a unit can be assigned to a contract and then removed', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'A');

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});

	const assigned = await api.contract.units.getMany({ contractId: contract.id });
	assert.equal(assigned.length, 1);
	assert.equal(assigned[0].id, unit.id);

	await api.contract.units.set({ contractId: contract.id, unitIds: [] });

	const afterRemoval = await api.contract.units.getMany({ contractId: contract.id });
	assert.equal(afterRemoval.length, 0);
});

test('the set is what the contract ends up holding, not what is added to it', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const complex = await api.complex.create({ name: 'Set Court', location: 'Riyadh' });
	const first = await api.complex.units.create({ name: 'S1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'S2', complexId: complex.id });

	await api.contract.units.set({ contractId: contract.id, unitIds: [first.id] });
	const held = await api.contract.units.set({ contractId: contract.id, unitIds: [second.id] });

	assert.deepEqual(
		held.map((unit) => unit.id),
		[second.id]
	);
});

test('units from more than one complex are held at once', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const one = await seedComplexWithUnit(api, 'X');
	const other = await seedComplexWithUnit(api, 'Y');

	const held = await api.contract.units.set({
		contractId: contract.id,
		unitIds: [one.unit.id, other.unit.id]
	});

	assert.deepEqual(held.map((unit) => unit.id).sort(), [one.unit.id, other.unit.id].sort());
});

test('the assignable set offers every unit no overlapping contract holds', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const held = await seedComplexWithUnit(api, 'P');
	const free = await seedComplexWithUnit(api, 'Q');
	const taken = await seedComplexWithUnit(api, 'R');

	const other = await seedContract(api);
	await api.contract.units.set({ contractId: other.id, unitIds: [taken.unit.id] });
	await api.contract.units.set({ contractId: contract.id, unitIds: [held.unit.id] });

	const assignable = await api.contract.units.getAssignableMany({ contractId: contract.id });
	const byId = new Map(assignable.map((unit) => [unit.id, unit]));

	assert.equal(byId.get(held.unit.id)?.isAssigned, true);
	assert.equal(byId.get(free.unit.id)?.isAssigned, false);
	assert.equal(byId.has(taken.unit.id), false, 'a unit an overlapping contract holds was offered');
});

test('the held pane lists a unit an overlapping contract also holds, as the contract’s own units do', async () => {
	const api = await createApi();
	const shared = await seedComplexWithUnit(api, 'S');
	const theirs = await seedComplexWithUnit(api, 'T');
	const contract = await seedContract(api);
	const other = await seedContract(api);

	// two overlapping contracts come to hold one unit: the first holds it and is terminated,
	// which frees the unit for the second, and restoring the first does not give it back.
	await api.contract.units.set({ contractId: contract.id, unitIds: [shared.unit.id] });
	await api.contract.terminate({ id: contract.id });
	await api.contract.units.set({
		contractId: other.id,
		unitIds: [shared.unit.id, theirs.unit.id]
	});
	await api.contract.unterminate({ id: contract.id });

	const assignable = await api.contract.units.getAssignableMany({ contractId: contract.id });
	const byId = new Map(assignable.map((unit) => [unit.id, unit]));
	const heldPane = assignable.filter((unit) => unit.isAssigned);
	const heldUnits = await api.contract.units.getMany({ contractId: contract.id });

	assert.equal(byId.get(shared.unit.id)?.isAssigned, true, 'a unit the contract holds was dropped');
	assert.equal(
		byId.has(theirs.unit.id),
		false,
		'a unit only the overlapping contract holds was offered'
	);
	assert.equal(heldPane.length, heldUnits.length);
	assert.equal(heldUnits.length, 1);
});

test('the assignable search narrows on the unit name and on the complex holding it', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const tower = await api.complex.create({ name: 'Coral Tower', location: 'Jeddah' });
	const court = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const inTower = await api.complex.units.create({ name: 'A1', complexId: tower.id });
	const inCourt = await api.complex.units.create({ name: 'B2', complexId: court.id });

	const byComplex = await api.contract.units.getAssignableMany({
		contractId: contract.id,
		search: 'Coral'
	});
	const byUnit = await api.contract.units.getAssignableMany({
		contractId: contract.id,
		search: 'B2'
	});

	assert.deepEqual(
		byComplex.map((unit) => unit.id),
		[inTower.id]
	);
	assert.deepEqual(
		byUnit.map((unit) => unit.id),
		[inCourt.id]
	);
});

test('assigning a unit already held by an overlapping contract is rejected', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'B');

	const first = await seedContract(api);
	await api.contract.units.set({
		contractId: first.id,
		unitIds: [unit.id]
	});

	const second = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.units.set({
				contractId: second.id,
				unitIds: [unit.id]
			}),
		refusedWith('contract.unitsUnavailable')
	);
});

test('a set naming a unit that does not exist is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() => api.contract.units.set({ contractId: contract.id, unitIds: [unusedId()] }),
		refusedWith('contract.unitsMissing')
	);
});

test('a unit cannot be assigned once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'C');

	await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() =>
			api.contract.units.set({
				contractId: contract.id,
				unitIds: [unit.id]
			}),
		refusedWith('contract.unitsLockedByPayments')
	);
});

test('a unit cannot be removed once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'D');

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});
	await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() => api.contract.units.set({ contractId: contract.id, unitIds: [] }),
		refusedWith('contract.unitsLockedByPayments')
	);
});

// --- Stored unit status across reconcile ------------------------------------------------
//
// The dashboard's occupancy summary is the one read of the STORED unit status, so it is
// what proves reconcile wrote the unit rows a mutation touched.

test('stored unit occupancy follows assignment and removal', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'E');

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});

	const afterAssign = await api.dashboard.get();
	assert.equal(afterAssign.summary.occupancy?.occupiedUnits, 1);

	await api.contract.units.set({ contractId: contract.id, unitIds: [] });

	const afterRemoval = await api.dashboard.get();
	assert.equal(afterRemoval.summary.occupancy?.occupiedUnits, 0);
});

test('a mutation on one contract keeps a shared unit occupied by the other', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'F');
	const past = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });
	const current = await seedContract(api);

	await api.contract.units.set({
		contractId: past.id,
		unitIds: [unit.id]
	});
	await api.contract.units.set({
		contractId: current.id,
		unitIds: [unit.id]
	});

	await api.payment.create({
		contractId: past.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const reloadedPast = await api.contract.get({ id: past.id });
	assert.ok(reloadedPast);
	assert.equal(reloadedPast.status, 'expired');

	const dashboard = await api.dashboard.get();
	assert.equal(dashboard.summary.occupancy?.occupiedUnits, 1);
});
