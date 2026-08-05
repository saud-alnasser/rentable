import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, seedTenant } from '$lib/api/testing.mjs';

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

test('the ledger lists every payment of its contract, newest first', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const older = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(-2),
		amount: 300
	});
	const newer = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[newer.id, older.id]
	);
});

test('payments made on one day are listed with the most recently recorded first', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const date = monthsFromNow(0);

	const first = await api.contract.payments.create({ contractId: contract.id, date, amount: 100 });
	const second = await api.contract.payments.create({ contractId: contract.id, date, amount: 200 });

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[second.id, first.id]
	);
});

test('a ledger holds only the payments of its own contract', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const other = await seedContract(api, { cost: 100000 });

	await api.contract.payments.create({
		contractId: other.id,
		date: monthsFromNow(0),
		amount: 700
	});
	const own = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[own.id]
	);
});

test('a ledger search matches an amount', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const matching = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1250
	});
	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(-1),
		amount: 400
	});

	const ledger = await api.contract.payments.getMany({ contractId: contract.id, search: '125' });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[matching.id]
	);
});

test('a ledger search matches the day a payment was made', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const matching = await api.contract.payments.create({
		contractId: contract.id,
		date: Date.UTC(2026, 2, 20),
		amount: 500
	});
	await api.contract.payments.create({
		contractId: contract.id,
		date: Date.UTC(2026, 3, 20),
		amount: 500
	});

	const byMonth = await api.contract.payments.getMany({
		contractId: contract.id,
		search: '2026-03'
	});
	const byDay = await api.contract.payments.getMany({
		contractId: contract.id,
		search: '2026-03-20'
	});

	assert.deepEqual(
		byMonth.map((payment) => payment.id),
		[matching.id]
	);
	assert.deepEqual(
		byDay.map((payment) => payment.id),
		[matching.id]
	);
});

test('a ledger search reads a wildcard as text, not as a pattern', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	assert.deepEqual(
		await api.contract.payments.getMany({ contractId: contract.id, search: '%' }),
		[]
	);
	assert.deepEqual(
		await api.contract.payments.getMany({ contractId: contract.id, search: '_' }),
		[]
	);
});

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
