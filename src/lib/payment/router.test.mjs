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
