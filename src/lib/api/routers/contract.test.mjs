import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryDatabase } from '../database/memory.ts';
import { appRouter } from '../router.ts';
import { caller, context } from '../trpc.ts';

// A fixed instant. It is the real "now" so these tests pin the same behaviour whether a
// procedure reads the clock ambiently (today) or from the injected context (after the
// clock is threaded through). All contract dates below are expressed relative to it.
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

let tenantSeq = 0;

async function seedTenant(api) {
	tenantSeq += 1;
	const suffix = String(tenantSeq).padStart(4, '0');

	return api.tenant.create({
		name: `Tenant ${tenantSeq}`,
		nationalId: `1000${suffix}00`.slice(0, 10),
		phone: `+96655${suffix}000`.slice(0, 13)
	});
}

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

// --- Payments ------------------------------------------------------------------------

test('recording a payment increases the contract paid amount', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const reloaded = await api.contract.get({ id: contract.id });
	assert.equal(reloaded.paidAmount, 500);
});

test('a payment against a missing contract is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.contract.payments.create({ contractId: 9999, date: monthsFromNow(0), amount: 500 }),
		/contract does not exist/
	);
});

test('a non-positive payment is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.payments.create({ contractId: contract.id, date: monthsFromNow(0), amount: 0 }),
		/payment amount must be greater than zero/
	);
});

test('a payment is rejected once the contract is fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	await assert.rejects(
		() =>
			api.contract.payments.create({ contractId: contract.id, date: monthsFromNow(0), amount: 1 }),
		/fully paid/
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
// These pin the status model AS IT IS TODAY, which is surprising and disagrees with the
// glossary in CONTEXT.md: a contract PAST its end date is `defaulted` when unpaid and
// `expired` when fully paid, while WITHIN its period it is `active` when unpaid and
// `fulfilled` when fully paid. "Current vs behind" plays no part. Pinned deliberately so a
// later correction (the contract domain module) is a visible, intended change — not an
// accident. Do not "fix" these expectations here.

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
