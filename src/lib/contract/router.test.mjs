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
	const { complex, unit } = await seedComplexWithUnit(api, 'A');

	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [unit.id]
	});

	const assigned = await api.contract.units.getMany({ contractId: contract.id });
	assert.equal(assigned.length, 1);
	assert.equal(assigned[0].id, unit.id);

	await api.contract.units.remove({ contractId: contract.id, unitId: unit.id });

	const afterRemoval = await api.contract.units.getMany({ contractId: contract.id });
	assert.equal(afterRemoval.length, 0);
});

test('assigning a unit already held by an overlapping contract is rejected', async () => {
	const api = await createApi();
	const { complex, unit } = await seedComplexWithUnit(api, 'B');

	const first = await seedContract(api);
	await api.contract.units.assign({
		contractId: first.id,
		complexId: complex.id,
		unitIds: [unit.id]
	});

	const second = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.units.assign({
				contractId: second.id,
				complexId: complex.id,
				unitIds: [unit.id]
			}),
		/overlapping contract/
	);
});

test('removing a unit that is not assigned is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() => api.contract.units.remove({ contractId: contract.id, unitId: 9999 }),
		/unit is not assigned/
	);
});

test('a unit cannot be assigned once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { complex, unit } = await seedComplexWithUnit(api, 'C');

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() =>
			api.contract.units.assign({
				contractId: contract.id,
				complexId: complex.id,
				unitIds: [unit.id]
			}),
		/cannot change contract units after payments have been registered/
	);
});

test('a unit cannot be removed once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { complex, unit } = await seedComplexWithUnit(api, 'D');

	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [unit.id]
	});
	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() => api.contract.units.remove({ contractId: contract.id, unitId: unit.id }),
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
	const { complex, unit } = await seedComplexWithUnit(api, 'E');

	await api.contract.units.assign({
		contractId: contract.id,
		complexId: complex.id,
		unitIds: [unit.id]
	});

	const afterAssign = await api.contract.dashboard();
	assert.equal(afterAssign.summary.occupancy.occupiedUnits, 1);

	await api.contract.units.remove({ contractId: contract.id, unitId: unit.id });

	const afterRemoval = await api.contract.dashboard();
	assert.equal(afterRemoval.summary.occupancy.occupiedUnits, 0);
});

test('a mutation on one contract keeps a shared unit occupied by the other', async () => {
	const api = await createApi();
	const { complex, unit } = await seedComplexWithUnit(api, 'F');
	const past = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });
	const current = await seedContract(api);

	await api.contract.units.assign({
		contractId: past.id,
		complexId: complex.id,
		unitIds: [unit.id]
	});
	await api.contract.units.assign({
		contractId: current.id,
		complexId: complex.id,
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

// --- The triage queue -------------------------------------------------------------------
//
// `getMany` answers the contracts list, which opens as a queue rather than a browse: the
// order is the attention rank, and the search is the query's own. Both are asserted here
// because both are what the list may not redo on the client.

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

test('the contract list opens in attention order', async () => {
	const api = await createApi();
	const seeded = await seedOneContractPerStatus(api);

	const listed = await api.contract.getMany({});

	assert.deepEqual(
		listed.map((contract) => contract.status),
		['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated']
	);
	assert.deepEqual(
		listed.map((contract) => contract.id),
		[
			seeded.defaulted.id,
			seeded.active.id,
			seeded.scheduled.id,
			seeded.fulfilled.id,
			seeded.expired.id,
			seeded.terminated.id
		]
	);
});

test('the contract list orders the soonest end date first within a rank', async () => {
	const api = await createApi();
	const later = await seedContract(api, { start: monthsFromNow(-1), end: monthsFromNow(11) });
	const sooner = await seedContract(api, {
		start: monthsFromNow(-1),
		end: monthsFromNow(5),
		interval: '6m'
	});

	const listed = await api.contract.getMany({});

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[sooner.id, later.id]
	);
});

test('searching the contract list narrows it and keeps the attention order', async () => {
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
		(await api.contract.getMany({ search: 'gov-' })).map((contract) => contract.status),
		['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated']
	);
	assert.deepEqual(await api.contract.getMany({ search: 'nothing matches this' }), []);
});

// The row stops showing the gov id, the phone, the cost and the interval, and decision 03
// holds that dropping a field from a surface never drops it from search.
test('the contract search still reaches the fields the row stopped showing', async () => {
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
