// Characterizes the landing screen's work queue at a fixed clock with a fake host supplying
// the notice window. All dates are relative to the fixed NOW, so every figure below is
// derivable by hand from the fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { NOW, createApi, monthsFromNow, seedTenant } from '$lib/api/testing.mjs';

import { DASHBOARD_ENTRIES_PER_RANK } from './dashboard.ts';

// A portfolio covering every rank and every reason to be in none. Statuses follow the code
// as implemented — see the caveat in contract.test.mjs; do not "fix" these expectations here.
// Per contract: cost, period, interval, payments —
// A: 1000, starts today, 12m, 250 paid today  → active,     owes 750
// B: 2000, mid-period, 12m, 500 paid today    → active,     owes 1500
// C: 3000, starts in two months, 12m, unpaid  → scheduled,  owes nothing, in no rank
// D: 4000, ended a month ago, 12m, unpaid     → defaulted,  owes 4000, past its end
// E: 5000, ended two months ago, paid in full → expired,    in no rank
// F: 6000, mid-period, paid in full           → fulfilled,  ends in 9 months, in no rank
// G: 7000, mid-period, manually terminated    → terminated, in no rank
// H: 8000, ends within a month, 12m, unpaid   → active,     owes 8000 and is ending soon
// I: 100, ends within a month, paid in full   → fulfilled,  ends inside the notice window
// J: 9000, two months into a quarter, unpaid  → active,     owes 9000, none of it this month
async function seedPortfolio(api) {
	const tenant = await seedTenant(api);

	const contract = async (govId, cost, startMonths, endMonths, interval = '12m', endDays = 0) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(startMonths),
			end: monthsFromNow(endMonths, endDays),
			interval,
			tenantId: tenant.id
		});

	const a = await contract('GOV-A', 1000, 0, 12);
	const b = await contract('GOV-B', 2000, -6, 6);
	await contract('GOV-C', 3000, 2, 14);
	await contract('GOV-D', 4000, -13, -1);
	const e = await contract('GOV-E', 5000, -14, -2);
	const f = await contract('GOV-F', 6000, -3, 9);
	const g = await contract('GOV-G', 7000, -1, 11);
	await contract('GOV-H', 8000, -11, 1);
	const i = await contract('GOV-I', 100, -11, 1);
	await contract('GOV-J', 9000, -2, 4, '3m', -1);

	// one complex with three units; one assigned to the active contract A — the sync step
	// after the mutation writes it back as occupied, the other two stay vacant.
	const complex = await api.complex.create({ name: 'Complex 1', location: 'City' });
	const unit = await api.complex.units.create({ name: 'Unit 1', complexId: complex.id });
	await api.complex.units.create({ name: 'Unit 2', complexId: complex.id });
	await api.complex.units.create({ name: 'Unit 3', complexId: complex.id });
	await api.contract.units.set({ contractId: a.id, unitIds: [unit.id] });

	// payments after unit assignment — units lock once payments exist.
	const pay = (contractId, amount, dateMonths) =>
		api.contract.payments.create({ contractId, amount, date: monthsFromNow(dateMonths) });

	// past payments sit two months back: one month back can overflow into the current
	// month on days 29-31 (Date.UTC normalizes, e.g. Jun 31 -> Jul 1), two never can.
	await pay(a.id, 250, 0);
	await pay(b.id, 500, 0);
	await pay(e.id, 5000, -2);
	await pay(f.id, 6000, -2);
	await pay(i.id, 100, -2);

	await api.contract.terminate({ id: g.id });
}

const queueEntry = (queue, govId) => queue.find((entry) => entry.govId === govId);

test('the queue is read overdue first, then owing, then ending soon', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { queue } = await api.contract.dashboard();

	assert.deepEqual(
		queue.map(({ govId, rank, outstandingAmount }) => ({ govId, rank, outstandingAmount })),
		[
			{ govId: 'GOV-D', rank: 'overdue', outstandingAmount: 4000 },
			{ govId: 'GOV-J', rank: 'owing', outstandingAmount: 9000 },
			{ govId: 'GOV-H', rank: 'owing', outstandingAmount: 8000 },
			{ govId: 'GOV-B', rank: 'owing', outstandingAmount: 1500 },
			{ govId: 'GOV-A', rank: 'owing', outstandingAmount: 750 },
			{ govId: 'GOV-I', rank: 'ending-soon', outstandingAmount: 0 }
		]
	);
});

// the defect this ticket exists to fix: J is a quarterly contract two months into its
// quarter, so nothing fell due in the current calendar month and it is a full cycle behind.
test('a contract behind by cycles that fell due in earlier months is in the queue', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { queue } = await api.contract.dashboard();

	assert.deepEqual(queueEntry(queue, 'GOV-J'), {
		id: queueEntry(queue, 'GOV-J').id,
		govId: 'GOV-J',
		rank: 'owing',
		status: 'active',
		tenantName: queueEntry(queue, 'GOV-J').tenantName,
		tenantPhone: queueEntry(queue, 'GOV-J').tenantPhone,
		outstandingAmount: 9000,
		contractEnd: queueEntry(queue, 'GOV-J').contractEnd,
		isEndingSoon: false
	});
});

test('a contract that owes money and ends inside the notice window is under the money, marked as also ending', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { queue } = await api.contract.dashboard();
	const endingAndOwing = queueEntry(queue, 'GOV-H');

	assert.equal(endingAndOwing.rank, 'owing');
	assert.equal(endingAndOwing.isEndingSoon, true);
	assert.equal(queueEntry(queue, 'GOV-I').isEndingSoon, true);
	assert.equal(queueEntry(queue, 'GOV-A').isEndingSoon, false);
});

test('a contract appears in exactly one rank', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { queue } = await api.contract.dashboard();

	assert.equal(new Set(queue.map(({ id }) => id)).size, queue.length);
});

// termination locks the contract, so a debt on one is a closed matter rather than work.
test('a terminated contract is in no rank, whatever it owes', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { queue } = await api.contract.dashboard();

	assert.equal(queueEntry(queue, 'GOV-G'), undefined);
});

test('each rank states its contract count and its money total', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { ranks } = await api.contract.dashboard();

	assert.deepEqual(ranks, [
		{ rank: 'overdue', contractCount: 1, totalAmount: 4000 },
		{ rank: 'owing', contractCount: 4, totalAmount: 19250 },
		{ rank: 'ending-soon', contractCount: 1, totalAmount: 0 }
	]);
});

test('with nothing outstanding and nothing ending, the queue is empty rather than ranked', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);
	const contract = await api.contract.create({
		govId: 'GOV-SETTLED',
		cost: 1000,
		start: monthsFromNow(-6),
		end: monthsFromNow(6),
		interval: '12m',
		tenantId: tenant.id
	});
	await api.contract.payments.create({
		contractId: contract.id,
		amount: 1000,
		date: monthsFromNow(-2)
	});

	const { queue, ranks } = await api.contract.dashboard();

	assert.deepEqual(queue, []);
	assert.deepEqual(ranks, []);
});

// what crosses the IPC boundary is bounded by what the screen paints. Seven overdue contracts
// of ascending cost: the four returned are the four largest debts, which is the rank's own
// order rather than an arbitrary four.
test('a rank returns at most the entries the screen shows, however many contracts are under it', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	for (let index = 0; index < 7; index += 1) {
		await api.contract.create({
			govId: `GOV-OVERDUE-${index}`,
			cost: 1000 + index,
			start: monthsFromNow(-13),
			end: monthsFromNow(-1),
			interval: '12m',
			tenantId: tenant.id
		});
	}

	const { queue, ranks } = await api.contract.dashboard();

	assert.equal(queue.length, DASHBOARD_ENTRIES_PER_RANK);
	assert.deepEqual(
		queue.map(({ govId }) => govId),
		['GOV-OVERDUE-6', 'GOV-OVERDUE-5', 'GOV-OVERDUE-4', 'GOV-OVERDUE-3']
	);

	// the rank still states all seven and what all seven owe: the counts are summarized before
	// the entries are capped, which is what the screen's way through to the rest is figured from.
	assert.deepEqual(ranks, [{ rank: 'overdue', contractCount: 7, totalAmount: 7021 }]);
});

// the strip is two figures and no others, and it carries no timestamp: the query cache is
// trusted until a writer says otherwise, so a "last current at" would contradict the policy
// that keeps the screen truthful.
test('the strip carries exactly two figures and no timestamp', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const dashboard = await api.contract.dashboard();

	assert.deepEqual(Object.keys(dashboard.summary).sort(), ['money', 'occupancy']);
	assert.deepEqual(Object.keys(dashboard.summary.money).sort(), ['collected', 'due']);
	assert.deepEqual(Object.keys(dashboard.summary.occupancy).sort(), [
		'occupiedUnits',
		'totalUnits'
	]);
	assert.equal('generatedAt' in dashboard, false);
});

test('the two strip figures are pinned', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { summary } = await api.contract.dashboard();

	// due: only A has a cycle falling due this month (its start). collected: every payment
	// dated inside the month, which is the three dated today (250 + 500 + 0).
	assert.deepEqual(summary.money, { due: 1000, collected: 750 });
	assert.deepEqual(summary.occupancy, { totalUnits: 3, occupiedUnits: 1 });
});

test('the notice window comes from the host, not the desktop shell', async () => {
	const api = await createApi({
		host: { settings: { get: async () => ({ endingSoonNoticeDays: 7, locale: 'en' }) } }
	});
	await seedPortfolio(api);

	const dashboard = await api.contract.dashboard();

	assert.equal(dashboard.endingSoonNoticeDays, 7);
	// a seven-day window catches nothing in the fixture, so the renewals rank empties and
	// H stops being marked as also ending while still owing.
	assert.equal(queueEntry(dashboard.queue, 'GOV-I'), undefined);
	assert.equal(queueEntry(dashboard.queue, 'GOV-H').isEndingSoon, false);
});

test('the aggregation is identical across repeated calls', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const first = await api.contract.dashboard();
	const second = await api.contract.dashboard();

	assert.deepEqual(second, first);
});

// The screen's cost is a function of how many contracts exist, never of how many payments
// have been recorded: outstanding comes from the materialized `paid_amount` column, and the
// one payment read left is a scalar sum for the month figure.
test('the read never loads payment rows', () => {
	const source = readFileSync(new URL('./router.ts', import.meta.url), 'utf8');

	assert.doesNotMatch(source, /from '\$lib\/payment\/payment'/);
	assert.doesNotMatch(source, /getOutstandingExpectedAmount/);
	assert.match(source, /sum\(\$\{s\.payment\.amount\}\)/);
});

/**
 * The days a period covers, computed from the harness's fixed clock the same way the routers
 * compute them — so a test says *the first of last month* rather than a literal date that is
 * only correct on the day it was written.
 */
function dayOf(monthOffset, day) {
	const base = new Date(NOW);

	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, day);
}

/** A contract with room for the payments a period test puts against it. */
async function seedPayableContract(api) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 100000
	});
}

test('the money figures can be asked about a period other than the current month', async () => {
	const api = await createApi();
	const contract = await seedPayableContract(api);

	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 2), amount: 300 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 2), amount: 500 });

	const thisMonth = await api.contract.dashboard({ period: 'this-month' });
	const lastMonth = await api.contract.dashboard({ period: 'last-month' });

	assert.equal(thisMonth.summary.money.collected, 500);
	assert.equal(lastMonth.summary.money.collected, 300);
});

test('asking for nothing is asking about the current month, as it always was', async () => {
	const api = await createApi();
	const contract = await seedPayableContract(api);

	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 3), amount: 300 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 3), amount: 500 });

	const unasked = await api.contract.dashboard();
	const asked = await api.contract.dashboard({ period: 'this-month' });

	assert.deepEqual(unasked.summary.money, asked.summary.money);
});

// the criterion, and the reason this ticket is separate from the one that built the vocabulary:
// each surface accepting a period proves nothing on its own. The two are read by two different
// routers and they have to answer with the same money.
test('the landing figure and the ledger report the same money over one period', async () => {
	const api = await createApi();
	const contract = await seedPayableContract(api);

	// two inside last month and one outside it, so agreeing on a total is not agreeing on
	// everything that exists.
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 4), amount: 120 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 19), amount: 380 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 4), amount: 999 });

	for (const period of ['this-month', 'last-month', 'this-year', 'last-year']) {
		const { summary } = await api.contract.dashboard({ period });
		const ledger = await api.contract.payments.getMany({ contractId: contract.id, period });
		const ledgerTotal = ledger.reduce((sum, payment) => sum + payment.amount, 0);

		assert.equal(summary.money.collected, ledgerTotal, `the two surfaces disagree about ${period}`);
	}
});

// the boundary the shared condition exists for: the landing figure used to stop at midnight on
// the last day of the span, so a payment taken that afternoon was money the ledger listed and
// the band did not count.
test('and they agree about a payment made during the last day of the period', async () => {
	const api = await createApi();
	const contract = await seedPayableContract(api);

	const lastInstant = dayOf(0, 0) + 17 * 60 * 60 * 1000;
	await api.contract.payments.create({ contractId: contract.id, date: lastInstant, amount: 640 });

	const { summary } = await api.contract.dashboard({ period: 'last-month' });
	const ledger = await api.contract.payments.getMany({
		contractId: contract.id,
		period: 'last-month'
	});

	assert.equal(summary.money.collected, 640);
	assert.deepEqual(
		ledger.map((payment) => payment.amount),
		[640]
	);
});
