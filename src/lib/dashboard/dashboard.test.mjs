import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DASHBOARD_QUEUE_GROUPS,
	DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS,
	compareDashboardQueueEntries,
	getDashboardQueueGroup,
	isContractEndingSoon,
	isContractIncludedInDashboardPortfolio,
	isDashboardMoneyGroup,
	summarizeDashboardQueueGroups
} from './dashboard.ts';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const day = (value) => new Date(`${value}T00:00:00.000Z`);

test('the queue groups are ordered overdue, owing, then ending soon', () => {
	assert.deepEqual([...DASHBOARD_QUEUE_GROUPS], ['overdue', 'owing', 'ending-soon']);
});

test('a contract past its end date and still owing is overdue', () => {
	assert.equal(getDashboardQueueGroup('defaulted', day('2025-12-31'), 4000, NOW), 'overdue');
});

test('a contract inside its period and behind is owing', () => {
	assert.equal(getDashboardQueueGroup('active', day('2026-06-30'), 750, NOW), 'owing');
});

// the defect #268 exists to fix: membership is what the contract owes today, so a quarterly
// contract whose last cycle boundary fell two months ago is in the queue on that debt alone.
test('a debt that fell due in an earlier month still admits a contract to the queue', () => {
	assert.equal(getDashboardQueueGroup('active', day('2026-09-30'), 9000, NOW), 'owing');
});

test('a contract owing nothing but ending inside the notice window is a renewal', () => {
	assert.equal(getDashboardQueueGroup('active', day('2026-02-01'), 0, NOW), 'ending-soon');
	assert.equal(getDashboardQueueGroup('fulfilled', day('2026-02-01'), 0, NOW), 'ending-soon');
});

test('a contract owing nothing and ending outside the notice window is in no group', () => {
	assert.equal(getDashboardQueueGroup('active', day('2026-06-30'), 0, NOW), undefined);
	assert.equal(getDashboardQueueGroup('active', day('2026-02-01'), 0, NOW, 7), undefined);
});

test('a contract owing money and also ending soon is filed under the money', () => {
	assert.equal(getDashboardQueueGroup('active', day('2026-02-01'), 500, NOW), 'owing');
	assert.equal(isContractEndingSoon('active', day('2026-02-01'), NOW), true);
});

// termination locks the contract, so the debt on one is a closed matter rather than work.
test('a terminated contract is in no group, whatever it owes', () => {
	assert.equal(getDashboardQueueGroup('terminated', day('2025-12-31'), 9000, NOW), undefined);
	assert.equal(getDashboardQueueGroup('terminated', day('2026-02-01'), 0, NOW), undefined);
});

test('a scheduled or expired contract with nothing outstanding is in no group', () => {
	assert.equal(getDashboardQueueGroup('scheduled', day('2027-01-01'), 0, NOW), undefined);
	assert.equal(getDashboardQueueGroup('expired', day('2025-06-30'), 0, NOW), undefined);
});

test('the money groups order by largest outstanding, then soonest end, then tenant', () => {
	const entry = (group, outstandingAmount, contractEnd, tenantName) => ({
		group,
		outstandingAmount,
		contractEnd: day(contractEnd).getTime(),
		tenantName
	});

	const sorted = [
		entry('ending-soon', 0, '2026-02-01', 'Zara'),
		entry('owing', 500, '2026-06-30', 'Amal'),
		entry('overdue', 100, '2025-11-30', 'Basma'),
		entry('owing', 500, '2026-03-31', 'Yusuf'),
		entry('owing', 900, '2026-12-31', 'Nada'),
		entry('ending-soon', 0, '2026-01-20', 'Adam')
	].sort(compareDashboardQueueEntries);

	assert.deepEqual(
		sorted.map(({ tenantName }) => tenantName),
		['Basma', 'Nada', 'Yusuf', 'Amal', 'Adam', 'Zara']
	);
});

test('two money entries tied on outstanding and end date fall to the tenant name', () => {
	const left = { group: 'owing', outstandingAmount: 500, contractEnd: 0, tenantName: 'Amal' };
	const right = { group: 'owing', outstandingAmount: 500, contractEnd: 0, tenantName: 'Basma' };

	assert.ok(compareDashboardQueueEntries(left, right) < 0);
});

test('a group summary states its contract count and its money total', () => {
	const summaries = summarizeDashboardQueueGroups([
		{ group: 'overdue', outstandingAmount: 4000 },
		{ group: 'owing', outstandingAmount: 750 },
		{ group: 'owing', outstandingAmount: 250 },
		{ group: 'ending-soon', outstandingAmount: 0 }
	]);

	assert.deepEqual(summaries, [
		{ group: 'overdue', contractCount: 1, totalAmount: 4000 },
		{ group: 'owing', contractCount: 2, totalAmount: 1000 },
		{ group: 'ending-soon', contractCount: 1, totalAmount: 0 }
	]);
});

// the money/renewal split the surface turns on: a money group's contracts carry an amount and
// their rows record a payment, a renewals contract owes nothing and does neither.
test('the two money groups are money groups and the renewals group is not', () => {
	assert.equal(isDashboardMoneyGroup('overdue'), true);
	assert.equal(isDashboardMoneyGroup('owing'), true);
	assert.equal(isDashboardMoneyGroup('ending-soon'), false);
});

// the renewals heading carries its count and no money total, because a contract in that
// group owes nothing. A group is admitted by its count, so the zero total must not take the
// contracts under it with it.
test('a group of renewals is summarized on its count, though its money total is zero', () => {
	assert.deepEqual(
		summarizeDashboardQueueGroups([
			{ group: 'ending-soon', outstandingAmount: 0 },
			{ group: 'ending-soon', outstandingAmount: 0 }
		]),
		[{ group: 'ending-soon', contractCount: 2, totalAmount: 0 }]
	);
});

// the shell derives a header from the records under it, so a group nothing landed in has no
// header to state; summarizing it would put a count on a heading that never renders.
test('a group nothing landed in is not summarized', () => {
	assert.deepEqual(summarizeDashboardQueueGroups([{ group: 'owing', outstandingAmount: 750 }]), [
		{ group: 'owing', contractCount: 1, totalAmount: 750 }
	]);
	assert.deepEqual(summarizeDashboardQueueGroups([]), []);
});

test('dashboard portfolio helper excludes terminated contracts from the live portfolio size', () => {
	assert.equal(isContractIncludedInDashboardPortfolio('active'), true);
	assert.equal(isContractIncludedInDashboardPortfolio('defaulted'), true);
	assert.equal(isContractIncludedInDashboardPortfolio('terminated'), false);
});

test('ending soon helper uses the default notice window and supports custom overrides', () => {
	const now = new Date('2026-01-01T00:00:00.000Z');

	assert.equal(DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS, 60);
	assert.equal(isContractEndingSoon('active', new Date('2026-03-02T00:00:00.000Z'), now), true);
	assert.equal(isContractEndingSoon('fulfilled', new Date('2026-02-15T00:00:00.000Z'), now), true);
	assert.equal(isContractEndingSoon('active', new Date('2026-03-03T00:00:00.000Z'), now), false);
	assert.equal(isContractEndingSoon('active', new Date('2026-01-31T00:00:00.000Z'), now, 30), true);
	assert.equal(
		isContractEndingSoon('active', new Date('2026-02-01T00:00:00.000Z'), now, 30),
		false
	);
	assert.equal(isContractEndingSoon('defaulted', new Date('2026-02-15T00:00:00.000Z'), now), false);
	assert.equal(isContractEndingSoon('active', new Date('2025-12-31T00:00:00.000Z'), now), false);
});
