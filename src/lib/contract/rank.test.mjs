import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CONTRACT_RANKS,
	DEFAULT_ENDING_SOON_NOTICE_DAYS,
	compareContractsByRank,
	getContractRank,
	isContractEndingSoon,
	isMoneyRank,
	summarizeContractRanks
} from './rank.ts';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const day = (value) => new Date(`${value}T00:00:00.000Z`);

test('the ranks are ordered overdue, owing, then ending soon', () => {
	assert.deepEqual([...CONTRACT_RANKS], ['overdue', 'owing', 'ending-soon']);
});

test('a contract past its end date and still owing is overdue', () => {
	assert.equal(getContractRank('defaulted', day('2025-12-31'), 4000, NOW), 'overdue');
});

test('a contract inside its period and behind is owing', () => {
	assert.equal(getContractRank('active', day('2026-06-30'), 750, NOW), 'owing');
});

// the defect #268 exists to fix: membership is what the contract owes today, so a quarterly
// contract whose last cycle boundary fell two months ago is ranked on that debt alone.
test('a debt that fell due in an earlier month still gives a contract a rank', () => {
	assert.equal(getContractRank('active', day('2026-09-30'), 9000, NOW), 'owing');
});

test('a contract owing nothing but ending inside the notice window is a renewal', () => {
	assert.equal(getContractRank('active', day('2026-02-01'), 0, NOW), 'ending-soon');
	assert.equal(getContractRank('fulfilled', day('2026-02-01'), 0, NOW), 'ending-soon');
});

test('a contract owing nothing and ending outside the notice window has no rank', () => {
	assert.equal(getContractRank('active', day('2026-06-30'), 0, NOW), undefined);
	assert.equal(getContractRank('active', day('2026-02-01'), 0, NOW, 7), undefined);
});

test('a contract owing money and also ending soon is ranked on the money', () => {
	assert.equal(getContractRank('active', day('2026-02-01'), 500, NOW), 'owing');
	assert.equal(isContractEndingSoon('active', day('2026-02-01'), NOW), true);
});

// termination locks the contract, so the debt on one is a closed matter rather than work.
test('a terminated contract has no rank, whatever it owes', () => {
	assert.equal(getContractRank('terminated', day('2025-12-31'), 9000, NOW), undefined);
	assert.equal(getContractRank('terminated', day('2026-02-01'), 0, NOW), undefined);
});

test('a scheduled or expired contract with nothing outstanding has no rank', () => {
	assert.equal(getContractRank('scheduled', day('2027-01-01'), 0, NOW), undefined);
	assert.equal(getContractRank('expired', day('2025-06-30'), 0, NOW), undefined);
});

test('the money ranks order by largest outstanding, then soonest end, then tenant', () => {
	const entry = (rank, outstandingAmount, contractEnd, tenantName) => ({
		rank,
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
	].sort(compareContractsByRank);

	assert.deepEqual(
		sorted.map(({ tenantName }) => tenantName),
		['Basma', 'Nada', 'Yusuf', 'Amal', 'Adam', 'Zara']
	);
});

test('two money entries tied on outstanding and end date fall to the tenant name', () => {
	const left = { rank: 'owing', outstandingAmount: 500, contractEnd: 0, tenantName: 'Amal' };
	const right = { rank: 'owing', outstandingAmount: 500, contractEnd: 0, tenantName: 'Basma' };

	assert.ok(compareContractsByRank(left, right) < 0);
});

test('a rank summary states its contract count and its money total', () => {
	const summaries = summarizeContractRanks([
		{ rank: 'overdue', outstandingAmount: 4000 },
		{ rank: 'owing', outstandingAmount: 750 },
		{ rank: 'owing', outstandingAmount: 250 },
		{ rank: 'ending-soon', outstandingAmount: 0 }
	]);

	assert.deepEqual(summaries, [
		{ rank: 'overdue', contractCount: 1, totalAmount: 4000 },
		{ rank: 'owing', contractCount: 2, totalAmount: 1000 },
		{ rank: 'ending-soon', contractCount: 1, totalAmount: 0 }
	]);
});

// the money/renewal split every reader of a rank turns on: a money rank's contracts carry an
// amount, a renewals contract owes nothing by construction and does not.
test('the two money ranks are money ranks and the renewals rank is not', () => {
	assert.equal(isMoneyRank('overdue'), true);
	assert.equal(isMoneyRank('owing'), true);
	assert.equal(isMoneyRank('ending-soon'), false);
});

// a renewals heading carries its count and no money total, because a contract in that rank
// owes nothing. A rank is admitted by its count, so the zero total must not take the
// contracts under it with it.
test('a rank of renewals is summarized on its count, though its money total is zero', () => {
	assert.deepEqual(
		summarizeContractRanks([
			{ rank: 'ending-soon', outstandingAmount: 0 },
			{ rank: 'ending-soon', outstandingAmount: 0 }
		]),
		[{ rank: 'ending-soon', contractCount: 2, totalAmount: 0 }]
	);
});

// a reader derives a heading from the records under it, so a rank nothing landed in has no
// heading to state; summarizing it would put a count on one that never renders.
test('a rank nothing landed in is not summarized', () => {
	assert.deepEqual(summarizeContractRanks([{ rank: 'owing', outstandingAmount: 750 }]), [
		{ rank: 'owing', contractCount: 1, totalAmount: 750 }
	]);
	assert.deepEqual(summarizeContractRanks([]), []);
});

test('ending soon uses the default notice window and supports custom overrides', () => {
	const now = new Date('2026-01-01T00:00:00.000Z');

	assert.equal(DEFAULT_ENDING_SOON_NOTICE_DAYS, 60);
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
