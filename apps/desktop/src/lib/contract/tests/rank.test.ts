import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CONTRACT_RANKS,
	DEFAULT_ENDING_SOON_NOTICE_DAYS,
	compareContractsByRank,
	getContractRankBounds,
	getContractRank,
	getDueSoonCycle,
	isContractEndingSoon,
	isMoneyRank,
	summarizeContractRanks,
	type ContractRank,
	type ContractRankOrder
} from '../rank.ts';
import { getContractTotalCost, type ContractLike } from '../contract.ts';
import { ContractSchema, type Contract } from '$lib/platform/database/schema';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** a contract over `start` to `end`, costing 1,000 a cycle unless it says otherwise. */
const contract = (
	status: Contract['status'],
	start: string,
	end: string,
	interval: Contract['interval'] = '12m',
	cost = 1000
): ContractLike => ({ status, start: day(start), end: day(end), interval, cost });

/**
 * a monthly contract of 1,000 whose cycles fall due on the 18th, so on NOW its next cycle is due
 * in three days (2026-01-18) and the six before it, July to December, are due already.
 */
const DUE_IN_THREE_DAYS = contract('active', '2025-07-18', '2026-07-17', '1m');

test('the ranks are ordered overdue, owing, due soon, then ending soon', () => {
	assert.deepEqual([...CONTRACT_RANKS], ['overdue', 'owing', 'due-soon', 'ending-soon']);
});

test('a contract past its end date and still owing is overdue', () => {
	const ended = contract('defaulted', '2025-01-01', '2025-12-31', '12m', 4000);

	assert.equal(getContractRank(ended, 0, NOW), 'overdue');
});

test('a contract inside its period and behind is owing', () => {
	assert.equal(getContractRank(contract('active', '2025-07-01', '2026-06-30'), 250, NOW), 'owing');
});

// the defect #268 exists to fix: membership is what the contract owes today, so a quarterly
// contract whose last cycle boundary fell two months ago is ranked on that debt alone.
test('a debt that fell due in an earlier month still gives a contract a rank', () => {
	const quarterly = contract('active', '2025-10-01', '2026-09-30', '3m', 4500);

	assert.equal(getContractRank(quarterly, 0, NOW), 'owing');
});

test('a contract owing nothing but ending inside the notice window is a renewal', () => {
	assert.equal(
		getContractRank(contract('active', '2025-02-02', '2026-02-01'), 1000, NOW),
		'ending-soon'
	);
	assert.equal(
		getContractRank(contract('fulfilled', '2025-02-02', '2026-02-01'), 1000, NOW),
		'ending-soon'
	);
});

test('a contract owing nothing and ending outside the notice window has no rank', () => {
	assert.equal(
		getContractRank(contract('active', '2025-07-01', '2026-06-30'), 1000, NOW),
		undefined
	);
	assert.equal(
		getContractRank(contract('active', '2025-02-02', '2026-02-01'), 1000, NOW, 7),
		undefined
	);
});

test('a contract owing money and also ending soon is ranked on the money', () => {
	assert.equal(getContractRank(contract('active', '2025-02-02', '2026-02-01'), 500, NOW), 'owing');
	assert.equal(isContractEndingSoon('active', day('2026-02-01'), NOW), true);
});

// termination locks the contract, so the debt on one is a closed matter rather than work.
test('a terminated contract has no rank, whatever it owes or has coming due', () => {
	assert.equal(
		getContractRank(contract('terminated', '2025-01-01', '2025-12-31', '12m', 9000), 0, NOW),
		undefined
	);
	assert.equal(
		getContractRank(contract('terminated', '2025-02-02', '2026-02-01'), 1000, NOW),
		undefined
	);
	assert.equal(
		getContractRank({ ...DUE_IN_THREE_DAYS, status: 'terminated' }, 6000, NOW),
		undefined
	);
});

test('a scheduled or expired contract with nothing outstanding has no rank', () => {
	assert.equal(
		getContractRank(contract('scheduled', '2026-02-01', '2027-01-31'), 0, NOW),
		undefined
	);
	assert.equal(
		getContractRank(contract('expired', '2024-07-01', '2025-06-30'), 1000, NOW),
		undefined
	);
});

// --- Due soon, criterion 11 of effort 835 ----------------------------------------------

test('11(a): a contract whose next cycle is due in three days and is not covered is due soon', () => {
	assert.equal(getContractRank(DUE_IN_THREE_DAYS, 6000, NOW), 'due-soon');
	assert.deepEqual(getDueSoonCycle(DUE_IN_THREE_DAYS, 6000, NOW), {
		due: day('2026-01-18'),
		amount: 1000
	});
});

test('11(b): the same contract with that cycle prepaid is not due soon', () => {
	assert.equal(getContractRank(DUE_IN_THREE_DAYS, 7000, NOW), undefined);
	assert.equal(getDueSoonCycle(DUE_IN_THREE_DAYS, 7000, NOW), undefined);
});

test('11(c): a contract that owes today and has a cycle due in three days is owing only', () => {
	assert.equal(getContractRank(DUE_IN_THREE_DAYS, 5000, NOW), 'owing');
});

test('11(d): nothing is due soon for a cycle due in eight days', () => {
	const dueInEightDays = contract('active', '2025-07-23', '2026-07-22', '1m');

	assert.equal(getContractRank(dueInEightDays, 6000, NOW), undefined);
	assert.equal(getDueSoonCycle(dueInEightDays, 6000, NOW), undefined);
});

// the week is inclusive of its last day, as the notice window is.
test('a cycle due on the seventh day is due soon', () => {
	const dueInSevenDays = contract('active', '2025-07-22', '2026-07-21', '1m');

	assert.equal(getContractRank(dueInSevenDays, 6000, NOW), 'due-soon');
});

// a part paid ahead is covered, so what is coming due is only the rest of the cycle.
test('a cycle partly paid ahead is due soon for what it still lacks', () => {
	assert.equal(getContractRank(DUE_IN_THREE_DAYS, 6400, NOW), 'due-soon');
	assert.equal(getDueSoonCycle(DUE_IN_THREE_DAYS, 6400, NOW)?.amount, 600);
});

// the first cycle falls due on the start date, so a contract about to start is about to be owed.
test('a contract starting in three days with nothing paid is due soon for its first cycle', () => {
	const starting = contract('scheduled', '2026-01-18', '2027-01-17', '3m', 3000);

	assert.equal(getContractRank(starting, 0, NOW), 'due-soon');
	assert.deepEqual(getDueSoonCycle(starting, 0, NOW), { due: day('2026-01-18'), amount: 3000 });
});

// due soon reads before ending soon, and a contract is in one rank.
test('a contract with a cycle coming due and ending inside the notice window is due soon', () => {
	const endingMonthly = contract('active', '2025-02-18', '2026-02-17', '1m');

	assert.equal(getContractRank(endingMonthly, 11000, NOW), 'due-soon');
});

test('due soon is not a money rank', () => {
	assert.equal(isMoneyRank('due-soon'), false);
});

test('the money ranks order by largest outstanding, then soonest end, then tenant', () => {
	const entry = (
		rank: ContractRank,
		outstandingAmount: number,
		contractEnd: string,
		tenantName: string,
		nextDue?: string
	): ContractRankOrder => ({
		rank,
		outstandingAmount,
		contractEnd: day(contractEnd).getTime(),
		tenantName,
		nextDue: nextDue ? day(nextDue).getTime() : undefined
	});

	const sorted = [
		entry('ending-soon', 0, '2026-02-01', 'Zara'),
		entry('due-soon', 0, '2026-06-30', 'Omar', '2026-01-20'),
		entry('owing', 500, '2026-06-30', 'Amal'),
		entry('due-soon', 0, '2026-03-31', 'Lina', '2026-01-17'),
		entry('overdue', 100, '2025-11-30', 'Basma'),
		entry('due-soon', 0, '2026-12-31', 'Hana', '2026-01-20'),
		entry('owing', 500, '2026-03-31', 'Yusuf'),
		entry('owing', 900, '2026-12-31', 'Nada'),
		entry('ending-soon', 0, '2026-01-20', 'Adam')
	].sort(compareContractsByRank);

	assert.deepEqual(
		sorted.map(({ tenantName }) => tenantName),
		['Basma', 'Nada', 'Yusuf', 'Amal', 'Lina', 'Hana', 'Omar', 'Adam', 'Zara']
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
		{ rank: 'due-soon', outstandingAmount: 0 },
		{ rank: 'ending-soon', outstandingAmount: 0 }
	]);

	assert.deepEqual(summaries, [
		{ rank: 'overdue', contractCount: 1, totalAmount: 4000 },
		{ rank: 'owing', contractCount: 2, totalAmount: 1000 },
		{ rank: 'due-soon', contractCount: 1, totalAmount: 0 },
		{ rank: 'ending-soon', contractCount: 1, totalAmount: 0 }
	]);
});

// the money split every reader of a rank turns on: a money rank's contracts carry an amount
// owed, and a due-soon or renewals contract owes nothing today.
test('the two money ranks are money ranks and the other two are not', () => {
	assert.equal(isMoneyRank('overdue'), true);
	assert.equal(isMoneyRank('owing'), true);
	assert.equal(isMoneyRank('due-soon'), false);
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
 * it is swept: every status against periods ending either side of every boundary the bounds
 * name, with cycles falling due either side of the week ahead, against amounts paid from nothing
 * to past the total.
 *
 * A drift in either direction fails here: a bound tightened past what the ranking means, or a
 * ranking widened past what the bounds still allow.
 */
test('every contract a rank holds satisfies that rank’s bounds', () => {
	const periods: [string, string, Contract['interval']][] = [
		// ended before today
		['2025-01-01', '2025-12-31', '12m'],
		['2025-01-15', '2026-01-14', '1m'],
		// ends today, and tomorrow
		['2025-01-16', '2026-01-15', '1m'],
		['2025-01-17', '2026-01-16', '1m'],
		// the next cycle due in three, seven and eight days
		['2025-07-18', '2026-07-17', '1m'],
		['2025-07-22', '2026-07-21', '1m'],
		['2025-07-23', '2026-07-22', '1m'],
		['2025-10-17', '2026-10-16', '3m'],
		// starting in three days
		['2026-01-18', '2027-01-17', '3m'],
		// ending either side of the notice window's last day
		['2025-03-16', '2026-03-15', '12m'],
		['2025-03-17', '2026-03-16', '12m'],
		['2025-03-18', '2026-03-17', '12m'],
		['2025-02-18', '2026-02-17', '1m'],
		// a period no whole number of cycles fits, which falls back to counting cycles to its end
		['2025-12-20', '2026-01-19', '3m'],
		['2026-01-01', '2027-01-01', '6m']
	];
	const paidCycles = [0, 0.5, 1, 5, 6, 6.4, 7, 11, 12, 13];
	const filed = new Set<ContractRank>();

	for (const status of STATUSES) {
		for (const [start, end, interval] of periods) {
			for (const cycles of paidCycles) {
				const subject = contract(status, start, end, interval);
				const paidAmount = cycles * subject.cost;
				const rank = getContractRank(subject, paidAmount, NOW);

				if (!rank) {
					continue;
				}

				filed.add(rank);
				const bounds = getContractRankBounds(rank, NOW);
				const where = `${rank}: ${status} ${start} to ${end} every ${interval}, paid ${paidAmount}`;

				if ('holds' in bounds.status) {
					assert.ok(bounds.status.holds.includes(status), where);
				} else {
					assert.ok(!bounds.status.excludes.includes(status), where);
				}

				if (bounds.requiresUnpaidBalance) {
					assert.ok(paidAmount < getContractTotalCost(subject), where);
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

// a cycle coming due is part of the total not yet paid, and falls due before the contract ends.
test('the due-soon bounds exclude terminated, require an unpaid balance, and start today', () => {
	const bounds = getContractRankBounds('due-soon', NOW);

	assert.deepEqual(bounds.status, { excludes: ['terminated'] });
	assert.equal(bounds.requiresUnpaidBalance, true);
	assert.equal(bounds.endFrom?.getTime(), day('2026-01-15').getTime());
	assert.equal(bounds.endBefore, undefined);
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
// its whole term, so the balance is not a bound this rank may narrow on.
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
