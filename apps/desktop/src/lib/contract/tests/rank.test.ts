import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CONTRACT_RANKS,
	DEFAULT_ENDING_SOON_NOTICE_DAYS,
	compareContractsByRank,
	getContractRankBounds,
	getContractRank,
	isContractEndingSoon,
	isMoneyRank,
	summarizeContractRanks,
	type ContractRank,
	type ContractRankOrder
} from '../rank.ts';
import { ContractSchema } from '$lib/platform/database/schema';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

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
	const entry = (
		rank: ContractRank,
		outstandingAmount: number,
		contractEnd: string,
		tenantName: string
	): ContractRankOrder => ({
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
	const left: ContractRankOrder = {
		rank: 'owing',
		outstandingAmount: 500,
		contractEnd: 0,
		tenantName: 'Amal'
	};
	const right: ContractRankOrder = {
		rank: 'owing',
		outstandingAmount: 500,
		contractEnd: 0,
		tenantName: 'Basma'
	};

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

// --- The bounds a rank puts on stored columns ------------------------------------------

// read off the schema rather than written out: a status added to the model has to join this
// sweep, and a list here would let it be added without anybody checking its bounds.
const STATUSES = ContractSchema.shape.status.options;

/**
 * The bounds are only worth narrowing a query on if nothing the rank holds falls outside them,
 * and that is a claim about every contract rather than about the handful a test would pick. So
 * it is swept: every status against a spread of end dates either side of both boundaries the
 * bounds name, against amounts owed and not owed.
 *
 * A drift in either direction fails here — a bound tightened past what the ranking means, or a
 * ranking widened past what the bounds still allow.
 */
test('every contract a rank holds satisfies that rank’s bounds', () => {
	const ends = [
		'2025-06-30',
		'2026-01-14',
		'2026-01-15',
		'2026-01-16',
		'2026-03-15',
		'2026-03-16',
		'2026-03-17',
		'2027-01-01'
	];
	const filed = new Set<ContractRank>();

	for (const status of STATUSES) {
		for (const end of ends) {
			for (const outstandingAmount of [0, 0.5, 4000]) {
				const rank = getContractRank(status, day(end), outstandingAmount, NOW);

				if (!rank) {
					continue;
				}

				filed.add(rank);
				const bounds = getContractRankBounds(rank, NOW);
				const where = `${rank}: ${status} ending ${end} owing ${outstandingAmount}`;

				if ('holds' in bounds.status) {
					assert.ok(bounds.status.holds.includes(status), where);
				} else {
					assert.ok(!bounds.status.excludes.includes(status), where);
				}

				if (bounds.endFrom) {
					assert.ok(day(end).getTime() >= bounds.endFrom.getTime(), where);
				}

				if (bounds.endBefore) {
					assert.ok(day(end).getTime() < bounds.endBefore.getTime(), where);
				}
			}
		}
	}

	// the sweep is only evidence if it actually filed something under each rank: a ranking that
	// answered `undefined` throughout would satisfy every assertion above and prove nothing.
	assert.deepEqual([...filed].sort(), [...CONTRACT_RANKS].sort());
});

// the two money ranks split the same set at one boundary, so a contract ending exactly today
// belongs to one of them and not to both. The end date is what divides them and today is the
// day it turns on.
test('the money ranks meet at today without overlapping', () => {
	const overdue = getContractRankBounds('overdue', NOW);
	const owing = getContractRankBounds('owing', NOW);

	assert.deepEqual(overdue.status, owing.status);
	assert.equal(overdue.requiresUnpaidBalance, true);
	assert.equal(owing.requiresUnpaidBalance, true);
	assert.equal(overdue.endFrom, undefined);
	assert.equal(overdue.endBefore?.getTime(), day('2026-01-15').getTime());
	assert.equal(owing.endFrom?.getTime(), day('2026-01-15').getTime());
	assert.equal(owing.endBefore, undefined);
});

// the notice window is inclusive of its last day, so the bound past it is the day after that.
test('the renewals bounds cover the notice window and stop the day after it', () => {
	const bounds = getContractRankBounds('ending-soon', NOW, 60);

	assert.deepEqual(bounds.status, { holds: ['active', 'fulfilled'] });
	assert.equal(bounds.endFrom?.getTime(), day('2026-01-15').getTime());
	assert.equal(bounds.endBefore?.getTime(), day('2026-03-17').getTime());

	// and it is the reader's window, not the default one
	assert.equal(
		getContractRankBounds('ending-soon', NOW, 1).endBefore?.getTime(),
		day('2026-01-17').getTime()
	);
});

// a renewals contract owes nothing today, which says nothing about what it has paid against
// its whole term — so the balance is not a bound this rank may narrow on.
test('the renewals rank puts no bound on the balance', () => {
	assert.equal(getContractRankBounds('ending-soon', NOW).requiresUnpaidBalance, false);
});

// the window is a count of days, and a settings file is not obliged to hold a sensible one.
test('a fractional or negative notice window is read as whole days, never backwards', () => {
	assert.equal(
		getContractRankBounds('ending-soon', NOW, 2.9).endBefore?.getTime(),
		day('2026-01-18').getTime()
	);
	assert.equal(
		getContractRankBounds('ending-soon', NOW, -5).endBefore?.getTime(),
		day('2026-01-16').getTime()
	);
});
