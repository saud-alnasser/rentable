import assert from 'node:assert/strict';
import test from 'node:test';

import {
	NOW,
	type Api,
	createApi,
	monthsFromNow,
	seedTenant,
	unusedId
} from '$lib/api/tests/testing.ts';

/** What `contract.create` takes — read off the procedure, so a fixture cannot drift from it. */
type ContractInput = Parameters<Api['contract']['create']>[0];

async function seedContract(api: Api, overrides: Partial<ContractInput> = {}) {
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

test('a payment is read with the contract it was made against', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'PAY-1' });
	const created = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const payment = await api.contract.payments.get({ id: created.id });

	assert.ok(payment, 'the payment just created reads back');
	assert.equal(payment.id, created.id);
	assert.equal(payment.amount, 500);
	assert.equal(payment.contractId, contract.id);
	// the context a payment cannot be read without: three figures and no way back is not a view
	assert.equal(payment.contractGovId, 'PAY-1');
	assert.equal(payment.contractStatus, contract.status);
	assert.ok(payment.tenantName);
});

test('reading a payment that does not exist answers with nothing rather than failing', async () => {
	const api = await createApi();

	assert.equal(await api.contract.payments.get({ id: unusedId() }), undefined);
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

	assert.ok(reloaded, 'the contract the payment was made against reads back');
	assert.equal(reloaded.paidAmount, 500);
});

test('a payment against a missing contract is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.contract.payments.create({
				contractId: unusedId(),
				date: monthsFromNow(0),
				amount: 500
			}),
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

test('a payment dated after today is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.payments.create({
				contractId: contract.id,
				date: monthsFromNow(0, 1),
				amount: 500
			}),
		/cannot be dated in the future/
	);
});

test('a payment dated today is taken', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const created = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	assert.equal(created.date, monthsFromNow(0));
});

test('a payment cannot be moved into the future by an edit', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	await assert.rejects(
		() => api.contract.payments.update({ id: payment.id, date: monthsFromNow(0, 1), amount: 500 }),
		/cannot be dated in the future/
	);
});

/**
 * The days a period covers, computed from the harness's fixed clock the same way the router
 * computes them — so a test says *the first of last month* rather than a literal date that is
 * only correct on the day it was written.
 */
function dayOf(monthOffset: number, day: number) {
	const base = new Date(NOW);

	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, day);
}

/** the last day of the month `monthOffset` away, which is day zero of the one after it. */
function lastDayOf(monthOffset: number) {
	return dayOf(monthOffset + 1, 0);
}

// the criterion this ticket exists for, and it is asserted at the router rather than at the
// rendered list: a filter that shortened the loaded set would pass any assertion made against
// what is on screen, which is exactly the thing being forbidden.
test('a period narrows which payments the read returns', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const lastMonth = await api.contract.payments.create({
		contractId: contract.id,
		date: dayOf(-1, 1),
		amount: 300
	});
	const thisMonth = await api.contract.payments.create({
		contractId: contract.id,
		date: dayOf(0, 1),
		amount: 500
	});

	const all = await api.contract.payments.getMany({ contractId: contract.id });
	const narrowed = await api.contract.payments.getMany({
		contractId: contract.id,
		period: 'last-month'
	});

	assert.deepEqual(
		all.map((payment) => payment.id).sort(),
		[lastMonth.id, thisMonth.id].sort(),
		'both payments exist'
	);
	assert.deepEqual(
		narrowed.map((payment) => payment.id),
		[lastMonth.id]
	);
});

// the boundary the half-open upper bound exists for: a payment stored with a time of day on the
// last day of the period is still inside it, and one on the first day of the next is not.
test('a period includes the whole of its last day and none of the next', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const lastInstant = await api.contract.payments.create({
		contractId: contract.id,
		date: lastDayOf(-1) + 23 * 60 * 60 * 1000,
		amount: 100
	});
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 1), amount: 200 });

	const narrowed = await api.contract.payments.getMany({
		contractId: contract.id,
		period: 'last-month'
	});

	assert.deepEqual(
		narrowed.map((payment) => payment.id),
		[lastInstant.id]
	);
});

test('a period and a search narrow together rather than one replacing the other', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const wanted = await api.contract.payments.create({
		contractId: contract.id,
		date: dayOf(-1, 2),
		amount: 777
	});
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 3), amount: 888 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 2), amount: 777 });

	const narrowed = await api.contract.payments.getMany({
		contractId: contract.id,
		search: '777',
		period: 'last-month'
	});

	assert.deepEqual(
		narrowed.map((payment) => payment.id),
		[wanted.id]
	);
});

test('no period returns the whole ledger, so an unset filter narrows nothing', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 4), amount: 100 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 4), amount: 200 });

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.equal(ledger.length, 2);
});
