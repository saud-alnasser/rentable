import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, seedTenant } from '$lib/api/testing.mjs';

async function seedComplexWithUnit(api, label) {
	const complex = await api.complex.create({ name: `Complex ${label}`, location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: `Unit ${label}`, complexId: complex.id });

	return { complex, unit };
}

async function seedContract(api, overrides = {}) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		...overrides
	});
}

// --- Creation ------------------------------------------------------------------------

test('creating a contract returns it with a derived status and normalized fields', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = await api.contract.create({
		tenantId: tenant.id,
		govId: '  GOV-1  ',
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	assert.equal(contract.tenantId, tenant.id);
	assert.equal(contract.govId, 'GOV-1');
	assert.equal(contract.cost, 1000);
	assert.equal(contract.interval, '12m');
	assert.ok(contract.id > 0);
	assert.equal(contract.paidAmount, 0);
});

test('creation rejects an end date before the start date', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(11),
				end: monthsFromNow(-1),
				interval: '12m',
				cost: 1000
			}),
		/end date must be after start date/
	);
});

test('creation rejects a non-positive cost', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 0
			}),
		/cost per payment must be greater than zero/
	);
});

test('creation rejects a period that is not a whole number of interval cycles', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(4),
				interval: '12m',
				cost: 1000
			}),
		/contract period must stay within/
	);
});

test('creation rejects a tenant that does not exist', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: 9999,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 1000
			}),
		/tenant does not exist/
	);
});

test('creation rejects a government id already used by another contract', async () => {
	const api = await createApi();
	await seedContract(api, { govId: 'DUP-1' });

	await assert.rejects(() => seedContract(api, { govId: 'DUP-1' }), /government id is associated/);
});

// --- Update --------------------------------------------------------------------------

test('updating a contract changes its stored fields', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const updated = await api.contract.update({
		id: contract.id,
		tenantId: contract.tenantId,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 2500
	});

	assert.equal(updated.cost, 2500);
});

test('updating a contract that does not exist is rejected', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.update({
				id: 9999,
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 1000
			}),
		/contract does not exist/
	);
});

test('a terminated contract is locked against updates', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	await api.contract.terminate({ id: contract.id });

	await assert.rejects(
		() =>
			api.contract.update({
				id: contract.id,
				tenantId: contract.tenantId,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 3000
			}),
		/terminated contracts are locked/
	);
});

test('updating with an invalid cost is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.update({
				id: contract.id,
				tenantId: contract.tenantId,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 0
			}),
		/cost per payment must be greater than zero/
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
		/overlapping contract/
	);
});

test('a set naming a unit that does not exist is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() => api.contract.units.set({ contractId: contract.id, unitIds: [9999] }),
		/one or more units could not be found/
	);
});

test('a unit cannot be assigned once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'C');

	await api.contract.payments.create({
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
		/cannot change contract units after payments have been registered/
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
	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() => api.contract.units.set({ contractId: contract.id, unitIds: [] }),
		/cannot change contract units after payments have been registered/
	);
});

// --- Derived status across every value ------------------------------------------------
//
// These pin the status model AS IT IS TODAY, which is surprising: a contract PAST its end
// date is `defaulted` when unpaid and `expired` when fully paid, while WITHIN its period it
// is `active` when unpaid and `fulfilled` when fully paid. "Current vs behind" plays no
// part. Pinned deliberately so a later correction (the contract domain module) is a
// visible, intended change — not an accident. Do not "fix" these expectations here.

test('derived status is scheduled when the contract starts in the future', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { start: monthsFromNow(2), end: monthsFromNow(14) });

	assert.equal(contract.status, 'scheduled');
});

test('derived status is active within the period when not fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api, {
		start: monthsFromNow(0, -10),
		end: monthsFromNow(12, -10)
	});

	assert.equal(contract.status, 'active');
});

test('derived status is fulfilled within the period once fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	const reloaded = await api.contract.get({ id: contract.id });
	assert.equal(reloaded.status, 'fulfilled');
});

test('derived status is defaulted after the period without full payment', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });

	assert.equal(contract.status, 'defaulted');
});

test('derived status is expired after the period once fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const reloaded = await api.contract.get({ id: contract.id });
	assert.equal(reloaded.status, 'expired');
});

test('derived status is terminated once a contract is terminated', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const terminated = await api.contract.terminate({ id: contract.id });

	assert.equal(terminated.status, 'terminated');
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

	const afterAssign = await api.contract.dashboard();
	assert.equal(afterAssign.summary.occupancy.occupiedUnits, 1);

	await api.contract.units.set({ contractId: contract.id, unitIds: [] });

	const afterRemoval = await api.contract.dashboard();
	assert.equal(afterRemoval.summary.occupancy.occupiedUnits, 0);
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

	await api.contract.payments.create({
		contractId: past.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const reloadedPast = await api.contract.get({ id: past.id });
	assert.equal(reloadedPast.status, 'expired');

	const dashboard = await api.contract.dashboard();
	assert.equal(dashboard.summary.occupancy.occupiedUnits, 1);
});

// --- Payment aggregates on reads -------------------------------------------------------

test('creating a contract returns the expected amount for its whole period', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	assert.equal(contract.expectedAmount, 1000);
	assert.equal(contract.paidAmount, 0);
});

test('the contract list carries the payment aggregates after a payment', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 400
	});

	const contracts = await api.contract.getMany({});
	const listed = contracts.find((candidate) => candidate.id === contract.id);

	assert.equal(listed.paidAmount, 400);
	assert.equal(listed.expectedAmount, 1000);
});

test('the contract list carries how many payments are recorded against each contract', async () => {
	const api = await createApi();
	const paid = await seedContract(api);
	const untouched = await seedContract(api);

	await api.contract.payments.create({ contractId: paid.id, date: monthsFromNow(0), amount: 100 });
	await api.contract.payments.create({ contractId: paid.id, date: monthsFromNow(0), amount: 200 });

	const contracts = await api.contract.getMany({});
	const listed = (id) => contracts.find((candidate) => candidate.id === id);

	assert.equal(listed(paid.id).paymentCount, 2);
	// a contract nobody has paid is counted as zero rather than dropped from the list — the
	// count rides the row, so a missing one would be a contract missing from the directory.
	assert.equal(listed(untouched.id).paymentCount, 0);
});

test('the contract list narrows to one tenant when asked', async () => {
	const api = await createApi();
	const held = await seedContract(api);
	await seedContract(api);

	const listed = await api.contract.getMany({ tenantId: held.tenantId });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[held.id]
	);
});

test('narrowing to a tenant with no contracts answers with an empty list', async () => {
	const api = await createApi();
	await seedContract(api);
	const stranger = await seedTenant(api);

	assert.deepEqual(await api.contract.getMany({ tenantId: stranger.id }), []);
});

test('a tenant filter and a search narrow together rather than one replacing the other', async () => {
	const api = await createApi();
	const held = await seedContract(api, { govId: 'KEEP-1' });
	await seedContract(api, { govId: 'DROP-1' });

	// the search matches nothing this tenant holds, so the pair must intersect: a filter that
	// replaced the search would answer with the tenant's whole set instead.
	assert.deepEqual(await api.contract.getMany({ tenantId: held.tenantId, search: 'DROP' }), []);

	const both = await api.contract.getMany({ tenantId: held.tenantId, search: 'KEEP' });
	assert.deepEqual(
		both.map((contract) => contract.id),
		[held.id]
	);
});

test('the contract list narrows to the contracts that mention one unit', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'U');
	const mentions = await seedContract(api);
	await seedContract(api);

	await api.contract.units.set({
		contractId: mentions.id,
		unitIds: [unit.id]
	});

	const listed = await api.contract.getMany({ unitId: unit.id });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[mentions.id]
	);
});

test('a contract holding several units appears once when narrowed to one of them', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Multi Court', location: 'Riyadh' });
	const first = await api.complex.units.create({ name: 'M1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'M2', complexId: complex.id });
	const contract = await seedContract(api);

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [first.id, second.id]
	});

	// matched through the assignment table rather than joined to it: a join would multiply the
	// contract into one row per unit it holds.
	const listed = await api.contract.getMany({ unitId: first.id });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[contract.id]
	);
});

test('the contract list narrows to the contracts that hold a unit in one complex', async () => {
	const api = await createApi();
	const { complex, unit } = await seedComplexWithUnit(api, 'C');
	const elsewhere = await seedComplexWithUnit(api, 'D');
	const holds = await seedContract(api);
	const other = await seedContract(api);

	await api.contract.units.set({ contractId: holds.id, unitIds: [unit.id] });
	await api.contract.units.set({ contractId: other.id, unitIds: [elsewhere.unit.id] });

	const listed = await api.contract.getMany({ complexId: complex.id });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[holds.id]
	);
});

test('narrowing to a complex holding no units answers with an empty list', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'E');
	const empty = await api.complex.create({ name: 'Empty Court', location: 'Riyadh' });
	const holds = await seedContract(api);

	await api.contract.units.set({ contractId: holds.id, unitIds: [unit.id] });

	assert.deepEqual(await api.contract.getMany({ complexId: empty.id }), []);
});

test('a contract holding units in two complexes appears once in each', async () => {
	const api = await createApi();
	const first = await seedComplexWithUnit(api, 'F');
	const second = await seedComplexWithUnit(api, 'G');
	const spare = await api.complex.units.create({
		name: 'Unit F2',
		complexId: first.complex.id
	});
	const contract = await seedContract(api);

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [first.unit.id, spare.id, second.unit.id]
	});

	// two units of this contract sit in the first complex, so a join through the assignment
	// table would answer with the contract twice.
	for (const complexId of [first.complex.id, second.complex.id]) {
		const listed = await api.contract.getMany({ complexId });

		assert.deepEqual(
			listed.map((candidate) => candidate.id),
			[contract.id]
		);
	}
});

test('the payment count follows a deleted payment back down', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await api.contract.payments.delete({ id: payment.id });

	const listed = (await api.contract.getMany({})).find((candidate) => candidate.id === contract.id);

	assert.equal(listed.paymentCount, 0);
});

test('updating the cost updates the expected amount on reads', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const updated = await api.contract.update({
		id: contract.id,
		tenantId: contract.tenantId,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 2500
	});

	assert.equal(updated.expectedAmount, 2500);

	const reloaded = await api.contract.get({ id: contract.id });
	assert.equal(reloaded.expectedAmount, 2500);
});

// --- The directory ----------------------------------------------------------------------
//
// `getMany` answers the contracts list, which opens as a directory rather than a queue: the
// order is whichever key the sort control chose, and the search is the query's own. Both are
// asserted here because both are what the list may not redo on the client.

// Seeds one contract per status, created in an order that is not the order they come back
// in — so a test asserting attention order cannot pass on insertion order by accident.
async function seedOneContractPerStatus(api) {
	const scheduled = await seedContract(api, {
		govId: 'GOV-SCHEDULED',
		start: monthsFromNow(2),
		end: monthsFromNow(14)
	});
	const expired = await seedContract(api, {
		govId: 'GOV-EXPIRED',
		start: monthsFromNow(-14),
		end: monthsFromNow(-2)
	});

	await api.contract.payments.create({
		contractId: expired.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const terminated = await seedContract(api, { govId: 'GOV-TERMINATED' });

	await api.contract.terminate({ id: terminated.id });

	const active = await seedContract(api, { govId: 'GOV-ACTIVE' });
	const fulfilled = await seedContract(api, { govId: 'GOV-FULFILLED' });

	await api.contract.payments.create({
		contractId: fulfilled.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	const defaulted = await seedContract(api, {
		govId: 'GOV-DEFAULTED',
		start: monthsFromNow(-14),
		end: monthsFromNow(-2)
	});

	return { defaulted, active, scheduled, fulfilled, expired, terminated };
}

test('the directory opens ordered by tenant name, then by when the contract runs', async () => {
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

	// Zaid's contract is created first, so an insertion order would put him at the top.
	const zaidContract = await seedContract(api, { tenantId: zaid.id, govId: 'GOV-Z' });
	const amalLater = await seedContract(api, {
		tenantId: amal.id,
		govId: 'GOV-A-LATER',
		start: monthsFromNow(1),
		end: monthsFromNow(13)
	});
	const amalEarlier = await seedContract(api, {
		tenantId: amal.id,
		govId: 'GOV-A-EARLIER',
		start: monthsFromNow(-6),
		end: monthsFromNow(6)
	});

	assert.deepEqual(
		(await api.contract.getMany({})).map((contract) => contract.id),
		[amalEarlier.id, amalLater.id, zaidContract.id]
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

	// Amal's contract starts earlier and ends later, so no two keys agree on the same pair
	// and a key wired to the wrong column shows up as a wrong order.
	const amalContract = await seedContract(api, {
		tenantId: amal.id,
		govId: 'GOV-2',
		start: monthsFromNow(-3),
		end: monthsFromNow(9),
		cost: 2000
	});
	const zaidContract = await seedContract(api, {
		tenantId: zaid.id,
		govId: 'GOV-1',
		start: monthsFromNow(-1),
		end: monthsFromNow(2),
		interval: '3m',
		cost: 1000
	});

	const orderBy = async (columnId, direction) =>
		(await api.contract.getMany({ sort: { columnId, direction } })).map((contract) => contract.id);

	assert.deepEqual(await orderBy('tenantName', 'asc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('tenantName', 'desc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('govId', 'asc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('govId', 'desc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('start', 'asc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('start', 'desc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('end', 'asc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('end', 'desc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('cost', 'asc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('cost', 'desc'), [amalContract.id, zaidContract.id]);
});

test('ordering the directory by status follows the attention ranking', async () => {
	const api = await createApi();

	await seedOneContractPerStatus(api);

	const attentionOrder = ['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated'];

	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'status', direction: 'asc' } })).map(
			(contract) => contract.status
		),
		attentionOrder
	);
	// descending reverses the ranking rather than reading the enum backwards by name, which
	// is the only ordering of these six words that means anything.
	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'status', direction: 'desc' } })).map(
			(contract) => contract.status
		),
		[...attentionOrder].reverse()
	);
});

test('the directory refuses to order by a column the sort control does not offer', async () => {
	const api = await createApi();

	await assert.rejects(() =>
		api.contract.getMany({ sort: { columnId: 'paidAmount', direction: 'asc' } })
	);
});

test('contracts tied on the chosen order fall back to the directory order', async () => {
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

	// created Zaid's first, so an id tie-break would put it first and a name one would not.
	const zaidContract = await seedContract(api, { tenantId: zaid.id, cost: 1000 });
	const amalContract = await seedContract(api, { tenantId: amal.id, cost: 1000 });

	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'cost', direction: 'desc' } })).map(
			(contract) => contract.id
		),
		[amalContract.id, zaidContract.id]
	);

	// both contracts also start on the same day, and start is itself one of the fallback
	// terms: ordering by it falls through to the tenant name rather than to the start again.
	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'start', direction: 'desc' } })).map(
			(contract) => contract.id
		),
		[amalContract.id, zaidContract.id]
	);
});

test('searching the contract list narrows it and keeps the chosen order', async () => {
	const api = await createApi();
	const seeded = await seedOneContractPerStatus(api);
	const tenant = await api.tenant.get({ id: seeded.active.tenantId });

	assert.deepEqual(
		(await api.contract.getMany({ search: 'GOV-ACTIVE' })).map((contract) => contract.id),
		[seeded.active.id]
	);
	assert.deepEqual(
		(await api.contract.getMany({ search: tenant.name })).map((contract) => contract.id),
		[seeded.active.id]
	);
	assert.deepEqual(
		(await api.contract.getMany({ search: tenant.phone })).map((contract) => contract.id),
		[seeded.active.id]
	);
	assert.deepEqual(
		(
			await api.contract.getMany({
				search: 'gov-',
				sort: { columnId: 'status', direction: 'asc' }
			})
		).map((contract) => contract.status),
		['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated']
	);
	assert.deepEqual(await api.contract.getMany({ search: 'nothing matches this' }), []);
});

// The row shows the tenant, the contract number, the period, the status and the cost; the
// phone, the tenant id and the interval as it is stored are not on it. Decision 03 holds
// that a field a surface does not show is still a field the list is searched by.
test('the contract search reaches the fields the row does not show', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-HIDDEN', interval: '3m', cost: 4321 });

	for (const term of ['GOV-HIDDEN', '3m', '4321', 'active']) {
		assert.deepEqual(
			(await api.contract.getMany({ search: term })).map((candidate) => candidate.id),
			[contract.id],
			`search term ${term}`
		);
	}
});

test('the contract search treats a wildcard character as text', async () => {
	const api = await createApi();

	await seedContract(api, { govId: 'GOV-PLAIN' });
	const literal = await seedContract(api, { govId: 'GOV-50%-SHARE' });

	assert.deepEqual(
		(await api.contract.getMany({ search: '50%' })).map((contract) => contract.id),
		[literal.id]
	);
	assert.deepEqual(await api.contract.getMany({ search: 'GOV_PLAIN' }), []);
});

test('the contract list returns the whole result set', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	for (let index = 0; index < 30; index += 1) {
		await api.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000 + index
		});
	}

	assert.equal((await api.contract.getMany({})).length, 30);
});

// --- Palette search -------------------------------------------------------------------

test('a contract is found by its reference or by the tenant holding it', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-42' });
	const tenant = await api.tenant.get({ id: contract.tenantId });

	assert.deepEqual(
		(await api.contract.search({ term: 'GOV-4' })).map((match) => match.id),
		[contract.id]
	);
	assert.deepEqual(
		(await api.contract.search({ term: tenant.name })).map((match) => match.label),
		['GOV-42']
	);
});

// a contract's reference is optional, so the tenant holding it is the handle when there is none.
test('a contract with no reference is found under the tenant holding it', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const tenant = await api.tenant.get({ id: contract.tenantId });

	assert.deepEqual(
		(await api.contract.search({ term: tenant.name })).map((match) => match.label),
		[tenant.name]
	);
});

test('a payment is found by its amount, across every contract', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-7' });
	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1234
	});

	const found = await api.contract.payments.search({ term: '1234' });

	assert.deepEqual(
		found.map((match) => match.id),
		[payment.id]
	);
	assert.equal(found[0].hint, 'GOV-7');
});

// --- Attention rank ------------------------------------------------------------------

// One contract per rank plus one in none, so a filter that answered with everything or with
// nothing is distinguishable from one that answered correctly.
async function seedRankedPortfolio(api) {
	const tenant = await seedTenant(api);

	const contract = (govId, cost, startMonths, endMonths) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(startMonths),
			end: monthsFromNow(endMonths),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('RANK-OVERDUE', 4000, -13, -1);
	await contract('RANK-OWING', 2000, -6, 6);

	// paid in full and ending inside the notice window: owes nothing, so it ranks as a renewal.
	const ending = await contract('RANK-ENDING', 100, -11, 1);
	await api.contract.payments.create({
		contractId: ending.id,
		amount: 100,
		date: monthsFromNow(-2)
	});

	// starts in two months and owes nothing yet — in no rank at all.
	await contract('RANK-NONE', 3000, 2, 14);
}

test('the contracts list narrows to one attention rank', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	const govIds = async (rank) =>
		(await api.contract.getMany({ rank })).map((contract) => contract.govId);

	assert.deepEqual(await govIds('overdue'), ['RANK-OVERDUE']);
	assert.deepEqual(await govIds('owing'), ['RANK-OWING']);
	assert.deepEqual(await govIds('ending-soon'), ['RANK-ENDING']);
});

test('asking for no rank answers with every contract, ranked or not', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	const all = await api.contract.getMany({});

	assert.equal(all.length, 4);
	assert.ok(all.some((contract) => contract.govId === 'RANK-NONE'));
});

test('a rank and a search narrow together rather than replacing one another', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	assert.deepEqual(
		(await api.contract.getMany({ rank: 'owing', search: 'RANK-OWING' })).map((c) => c.govId),
		['RANK-OWING']
	);
	assert.deepEqual(await api.contract.getMany({ rank: 'owing', search: 'RANK-OVERDUE' }), []);
});

// the order is part of what a rank means (ADR 0031), so a caller that asked for a rank and
// named no sort gets follow-up order — largest debt first inside a money rank.
test('a rank with no chosen sort answers in the rank’s own order', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = (govId, cost) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(-6),
			end: monthsFromNow(6),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('SMALL', 1200);
	await contract('LARGE', 9000);
	await contract('MIDDLE', 4800);

	assert.deepEqual(
		(await api.contract.getMany({ rank: 'owing' })).map((c) => c.govId),
		['LARGE', 'MIDDLE', 'SMALL']
	);
});

test('a chosen sort still wins over the rank’s own order', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = (govId, cost) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(-6),
			end: monthsFromNow(6),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('SMALL', 1200);
	await contract('LARGE', 9000);
	await contract('MIDDLE', 4800);

	const sorted = await api.contract.getMany({
		rank: 'owing',
		sort: { columnId: 'cost', direction: 'asc' }
	});

	assert.deepEqual(
		sorted.map((c) => c.govId),
		['SMALL', 'MIDDLE', 'LARGE']
	);
});
