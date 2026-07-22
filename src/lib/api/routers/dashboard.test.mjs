// Characterizes the dashboard aggregation at a fixed clock with a fake host supplying
// the notice window (#100 pinned the determinism seam; #105 pins the arithmetic). All
// dates are relative to the fixed NOW, all contracts are single-cycle 12m, so every
// figure below is derivable by hand from the fixture.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NOW, createApi, monthsFromNow, seedTenant } from '../testing.mjs';

// A portfolio covering every derived status. Statuses follow the code as implemented,
// which disagrees with the CONTEXT.md glossary on defaulted/expired — see the caveat in
// contract.test.mjs; do not "fix" these expectations here. Per contract: cost, period,
// payments —
// A: 1000, starts today, 250 paid today       → active,    due this month
// B: 2000, mid-period, 500 paid today         → active,    nothing due this month
// C: 3000, starts in two months, unpaid       → scheduled
// D: 4000, ended a month ago, unpaid          → defaulted
// E: 5000, ended two months ago, paid in full → expired
// F: 6000, mid-period, paid in full           → fulfilled
// G: 7000, mid-period, manually terminated    → terminated
// H: 8000, ends within a month, unpaid        → active,    ending soon
async function seedPortfolio(api) {
	const tenant = await seedTenant(api);

	const contract = async (govId, cost, startMonths, endMonths) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(startMonths),
			end: monthsFromNow(endMonths),
			interval: '12m',
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

	// one complex with three units; one assigned to the active contract A — the sync step
	// after the mutation writes it back as occupied, the other two stay vacant.
	const complex = await api.complex.create({ name: 'Complex 1', location: 'City' });
	const unit = await api.complex.units.create({ name: 'Unit 1', complexId: complex.id });
	await api.complex.units.create({ name: 'Unit 2', complexId: complex.id });
	await api.complex.units.create({ name: 'Unit 3', complexId: complex.id });
	await api.contract.units.assign({ contractId: a.id, complexId: complex.id, unitIds: [unit.id] });

	// payments after unit assignment — units lock once payments exist.
	const pay = (contractId, amount, dateMonths) =>
		api.contract.payments.create({ contractId, amount, date: monthsFromNow(dateMonths) });

	// past payments sit two months back: one month back can overflow into the current
	// month on days 29-31 (Date.UTC normalizes, e.g. Jun 31 -> Jul 1), two never can.
	await pay(a.id, 250, 0);
	await pay(b.id, 500, 0);
	await pay(e.id, 5000, -2);
	await pay(f.id, 6000, -2);

	await api.contract.terminate({ id: g.id });
}

test('dashboard timestamps come from the injected clock', async () => {
	const api = await createApi();

	const dashboard = await api.contract.dashboard();

	assert.equal(dashboard.generatedAt, NOW);
});

test('dashboard reads the notice window from the host, not the desktop shell', async () => {
	const api = await createApi({
		host: { settings: { get: async () => ({ endingSoonNoticeDays: 7, locale: 'en' }) } }
	});

	const dashboard = await api.contract.dashboard();

	assert.equal(dashboard.endingSoonNoticeDays, 7);
});

test('dashboard aggregation is identical across repeated calls', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	// an unpaid contract inside its period derives `active` and, ending within the notice
	// window, shows up in the ending-soon list — all of it derived from the fixed clock.
	await api.contract.create({
		govId: 'GOV-DASH-1',
		start: monthsFromNow(-11),
		end: monthsFromNow(1, -1),
		interval: '12m',
		cost: 1000,
		tenantId: tenant.id
	});

	const first = await api.contract.dashboard();
	const second = await api.contract.dashboard();

	assert.deepEqual(second, first);
	assert.equal(first.endingSoonContracts.length, 1);
	assert.equal(first.summary.contracts.active, 1);
});

test('contract counts by status are pinned', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { summary } = await api.contract.dashboard();

	// total is the live portfolio — every status except terminated.
	assert.deepEqual(summary.contracts, {
		total: 7,
		scheduled: 1,
		active: 3,
		fulfilled: 1,
		expired: 1,
		defaulted: 1,
		terminated: 1,
		endingSoon: 1
	});
});

test('monthly and overall money figures are pinned', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { summary } = await api.contract.dashboard();

	// due: only A has a payment falling due this month (its start). collected: the two
	// payments dated today (250 + 500). remaining: A's due minus what it covered.
	// outstanding: everything due by now and unpaid — A 750, B 1500, D 4000, H 8000.
	// overall rate: paid 11750 of expected 29000; monthly rate: covered 250 of due 1000.
	assert.deepEqual(summary.money, {
		dueThisMonth: 1000,
		collectedThisMonth: 750,
		remainingThisMonth: 750,
		outstandingNow: 14250,
		totalExpectedAmount: 29000,
		monthlyCollectionRate: 25,
		overallCollectionRate: 40.5
	});
});

test('occupancy figures are pinned', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { summary } = await api.contract.dashboard();

	assert.deepEqual(summary.occupancy, {
		totalUnits: 3,
		occupiedUnits: 1,
		vacantUnits: 2,
		occupancyRate: 33.3,
		vacancyRate: 66.7
	});
});

test('the follow-up list is pinned, sorted by outstanding amount', async () => {
	const api = await createApi();
	await seedPortfolio(api);

	const { followUps } = await api.contract.dashboard();

	// defaulted D follows up on its full outstanding amount; active A on what has fallen
	// due so far this month. B is active with nothing due, so it stays off despite owing.
	assert.deepEqual(
		followUps.map(({ govId, status, followUpAmount, dueNowAmount, outstandingAmount }) => ({
			govId,
			status,
			followUpAmount,
			dueNowAmount,
			outstandingAmount
		})),
		[
			{
				govId: 'GOV-D',
				status: 'defaulted',
				followUpAmount: 4000,
				dueNowAmount: 0,
				outstandingAmount: 4000
			},
			{
				govId: 'GOV-A',
				status: 'active',
				followUpAmount: 1000,
				dueNowAmount: 1000,
				outstandingAmount: 750
			}
		]
	);
});

test('ending-soon selection is pinned against the supplied notice window', async () => {
	const endingSoonGovIds = async (noticeDays) => {
		const api = await createApi(
			noticeDays === undefined
				? {}
				: { host: { settings: { get: async () => ({ endingSoonNoticeDays: noticeDays }) } } }
		);
		await seedPortfolio(api);
		const dashboard = await api.contract.dashboard();

		return dashboard.endingSoonContracts.map(({ govId }) => govId);
	};

	// the default 60-day window catches only H, ending within a month.
	assert.deepEqual(await endingSoonGovIds(undefined), ['GOV-H']);

	// a 400-day window catches every active or fulfilled contract, ordered by end date;
	// scheduled, expired, defaulted, and terminated contracts stay ineligible.
	assert.deepEqual(await endingSoonGovIds(400), ['GOV-H', 'GOV-B', 'GOV-F', 'GOV-A']);

	// a zero-day window catches only contracts ending today — none in this portfolio.
	assert.deepEqual(await endingSoonGovIds(0), []);
});
