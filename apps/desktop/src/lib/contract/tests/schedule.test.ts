import assert from 'node:assert/strict';
import test from 'node:test';
import {
	EPSILON,
	getContractTotalCost,
	getOutstandingExpectedAmount,
	type ContractLike
} from '../contract.ts';
import { scheduleContract, type SchedulePaymentLike } from '../schedule.ts';
import type { Contract } from '$lib/platform/database/schema';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** four quarterly cycles of 3,000 across 2026, the contract criteria 5 and 6(b) are stated on. */
const QUARTERLY: ContractLike = {
	status: 'active',
	start: day('2026-01-01'),
	end: day('2026-12-31'),
	interval: '3m',
	cost: 3000
};

// ids in UUIDv7 shape, so their order is the order they were recorded in.
const id = (sequence: number) =>
	`0199${sequence.toString(16).padStart(4, '0')}-0000-7000-8000-000000000000`;

const payment = (sequence: number, date: string, amount: number): SchedulePaymentLike => ({
	id: id(sequence),
	date: day(date),
	amount
});

const states = (contract: ContractLike, payments: SchedulePaymentLike[], now: Date) =>
	scheduleContract(contract, payments, now).cycles.map((cycle) => cycle.state);

// criterion 5
test('a twelve-month quarterly contract lays out as four cycles, each due its cost on the first day of its quarter', () => {
	const { cycles } = scheduleContract(QUARTERLY, [], day('2025-12-01'));

	assert.deepEqual(
		cycles.map((cycle) => [cycle.index, cycle.due.toISOString().slice(0, 10), cycle.amount]),
		[
			[0, '2026-01-01', 3000],
			[1, '2026-04-01', 3000],
			[2, '2026-07-01', 3000],
			[3, '2026-10-01', 3000]
		]
	);
});

// criterion 6(b), first case
test('with today inside the second cycle, 3,000 and 1,000 read paid, late with 1,000 covered, upcoming, upcoming', () => {
	const { cycles } = scheduleContract(
		QUARTERLY,
		[payment(1, '2026-01-01', 3000), payment(2, '2026-03-20', 1000)],
		day('2026-05-10')
	);

	assert.deepEqual(
		cycles.map((cycle) => [cycle.state, cycle.covered]),
		[
			['paid', 3000],
			['late', 1000],
			['upcoming', 0],
			['upcoming', 0]
		]
	);
});

// criterion 6(b), second case
test('with today before the second cycle is due, the same payments read paid, partly paid, upcoming, upcoming', () => {
	assert.deepEqual(
		states(
			QUARTERLY,
			[payment(1, '2026-01-01', 3000), payment(2, '2026-03-20', 1000)],
			day('2026-03-25')
		),
		['paid', 'partly-paid', 'upcoming', 'upcoming']
	);
});

test('a cycle due today and not covered in full is due, and becomes late the day after', () => {
	const payments = [payment(1, '2026-01-01', 3000)];

	assert.deepEqual(states(QUARTERLY, payments, day('2026-04-01')), [
		'paid',
		'due',
		'upcoming',
		'upcoming'
	]);
	assert.deepEqual(states(QUARTERLY, payments, day('2026-04-02')), [
		'paid',
		'late',
		'upcoming',
		'upcoming'
	]);
});

test('today is a whole UTC day, so the time of day does not move a cycle from due to late', () => {
	assert.equal(
		scheduleContract(QUARTERLY, [], new Date('2026-04-01T23:59:59.999Z')).cycles[1].state,
		'due'
	);
});

test('a cycle covered to within the domain tolerance is paid', () => {
	const { cycles } = scheduleContract(
		QUARTERLY,
		[payment(1, '2026-01-01', 1000.1), payment(2, '2026-01-02', 1999.9 - EPSILON / 2)],
		day('2026-05-10')
	);

	assert.equal(cycles[0].state, 'paid');
	assert.equal(cycles[1].state, 'late');
	assert.equal(cycles[1].covered, 0);
});

// criterion 6(c)
test('a terminated contract reads no cycle as late or due', () => {
	const terminated: ContractLike = { ...QUARTERLY, status: 'terminated' };
	const payments = [payment(1, '2026-01-01', 3000), payment(2, '2026-03-20', 1000)];

	for (const now of ['2026-04-01', '2026-05-10', '2026-10-01', '2027-06-01']) {
		const read = states(terminated, payments, day(now));

		assert.ok(!read.includes('late') && !read.includes('due'), `${now}: ${read.join(', ')}`);
	}

	// its cover still reads: the cycle covered in full is paid, and the one covered in part says so
	assert.deepEqual(states(terminated, payments, day('2026-05-10')), [
		'paid',
		'partly-paid',
		'upcoming',
		'upcoming'
	]);
});

test('payments are taken by date, not by the order they arrive in', () => {
	const { cycles, coverage } = scheduleContract(
		QUARTERLY,
		[payment(2, '2026-04-01', 1000), payment(1, '2026-01-01', 3000)],
		day('2026-05-10')
	);

	assert.deepEqual(coverage.get(id(1)), [0]);
	assert.deepEqual(coverage.get(id(2)), [1]);
	assert.deepEqual(
		cycles.map((cycle) => cycle.covered),
		[3000, 1000, 0, 0]
	);
});

test('payments on the same day are taken in the order they were recorded', () => {
	const { coverage } = scheduleContract(
		QUARTERLY,
		[
			// recorded second, listed first, and later in the day
			{ id: id(2), date: new Date('2026-01-01T18:00:00.000Z'), amount: 3000 },
			{ id: id(1), date: new Date('2026-01-01T06:00:00.000Z'), amount: 1000 }
		],
		day('2026-05-10')
	);

	assert.deepEqual(coverage.get(id(1)), [0]);
	assert.deepEqual(coverage.get(id(2)), [0, 1]);
});

// feeds criterion 9(d)
test('a payment covering the rest of one cycle and part of the next names both', () => {
	const { coverage } = scheduleContract(
		QUARTERLY,
		[
			payment(1, '2026-01-01', 3000),
			payment(2, '2026-04-01', 2000),
			payment(3, '2026-07-01', 2000)
		],
		day('2026-07-01')
	);

	assert.deepEqual(coverage.get(id(1)), [0]);
	assert.deepEqual(coverage.get(id(2)), [1]);
	assert.deepEqual(coverage.get(id(3)), [1, 2]);
});

test('what is paid past the total cost covers nothing, and every payment is in the coverage', () => {
	const { cycles, coverage } = scheduleContract(
		QUARTERLY,
		[payment(1, '2026-01-01', 12000), payment(2, '2026-02-01', 500)],
		day('2026-02-01')
	);

	assert.ok(cycles.every((cycle) => cycle.state === 'paid' && cycle.covered === 3000));
	assert.deepEqual(coverage.get(id(1)), [0, 1, 2, 3]);
	assert.deepEqual(coverage.get(id(2)), []);
});

test('the cycles cost what the contract costs in total', () => {
	for (const interval of ['1m', '3m', '6m', '12m'] as const) {
		const contract: ContractLike = { ...QUARTERLY, interval };
		const { cycles } = scheduleContract(contract, [], day('2026-05-10'));

		assert.equal(
			cycles.reduce((sum, cycle) => sum + cycle.amount, 0),
			getContractTotalCost(contract),
			interval
		);
	}
});

// --- Criterion 6(a): the schedule and the outstanding figure are one answer ------------

/** a small deterministic generator, so a failure names a case that can be run again. */
function random(seed: number) {
	let state = seed >>> 0;

	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;

		return state / 2 ** 32;
	};
}

const INTERVALS: Contract['interval'][] = ['1m', '3m', '6m', '12m'];
const STATUSES: Contract['status'][] = ['scheduled', 'active', 'fulfilled', 'defaulted', 'expired'];

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/**
 * Sum of what is uncovered across every late and due cycle, against the outstanding figure the
 * record already states, over contracts of every interval and length, starting on any day of the
 * month (so the calendar clamps), with payments of odd amounts in cents, on any day, overpaying
 * and underpaying, read on days before, inside and after the period.
 */
test('on every contract not terminated, the late and due cycles leave uncovered exactly what is outstanding', () => {
	const next = random(835);
	let cases = 0;
	let owing = 0;

	for (let iteration = 0; iteration < 4000; iteration += 1) {
		const interval = INTERVALS[Math.floor(next() * INTERVALS.length)];
		const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[interval];
		const cycleCount = 1 + Math.floor(next() * 12);
		const start = addDays(day('2024-01-01'), Math.floor(next() * 900));
		const endMonths = new Date(
			Date.UTC(
				start.getUTCFullYear(),
				start.getUTCMonth() + months * cycleCount,
				start.getUTCDate()
			)
		);
		const end = addDays(endMonths, -1 + Math.floor(next() * 7) - 3);
		const cost = Math.round((100 + next() * 9900) * 100) / 100;

		const contract: ContractLike = {
			status: STATUSES[Math.floor(next() * STATUSES.length)],
			start,
			end,
			interval,
			cost
		};

		const payments: SchedulePaymentLike[] = Array.from(
			{ length: Math.floor(next() * 10) },
			(_, index) => ({
				id: id(iteration * 16 + index),
				date: addDays(start, Math.floor(next() * 400) - 30),
				amount:
					next() < 0.5
						? cost * (1 + Math.floor(next() * 3))
						: Math.round(next() * cost * 2.5 * 100) / 100 + 0.01
			})
		);

		const now = addDays(start, Math.floor(next() * (months * cycleCount * 31 + 120)) - 60);
		const { cycles } = scheduleContract(contract, payments, now);
		const uncovered = cycles
			.filter((cycle) => cycle.state === 'late' || cycle.state === 'due')
			.reduce((sum, cycle) => sum + (cycle.amount - cycle.covered), 0);
		const outstanding = getOutstandingExpectedAmount(contract, payments, now);

		assert.ok(
			Math.abs(uncovered - outstanding) <= EPSILON,
			`seed 835, iteration ${iteration}: uncovered ${uncovered}, outstanding ${outstanding}`
		);

		cases += 1;

		if (outstanding > EPSILON) {
			owing += 1;
		}
	}

	// the sweep is only evidence if it met contracts that owe as well as ones that do not
	assert.equal(cases, 4000);
	assert.ok(owing > 500 && owing < 3500, `owing ${owing} of ${cases}`);
});
