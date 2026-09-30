import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	createApi,
	monthsFromNow,
	NOW,
	unusedId,
	refusedWith
} from '$lib/app/tests/testing.ts';
import { seedContract, seedRemindedContract } from '$lib/contract/tests/seed.ts';

// --- Schedule --------------------------------------------------------------------------

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

/** the first day of the month `months` from the fixed clock's, as a UTC timestamp. */
function firstOfMonthFromNow(months: number) {
	const base = new Date(NOW);

	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1);
}

/**
 * A twelve-month contract on a quarterly interval, each cycle 3,000, starting on the first of the
 * month `startMonths` from now: the contract criteria 5 and 6(b) of effort 835 are stated on.
 * Pinned to the first of a month so its quarters fall on the first of theirs whatever today is.
 */
function seedQuarterlyContract(api: Api, startMonths: number) {
	return seedContract(api, {
		start: firstOfMonthFromNow(startMonths),
		end: firstOfMonthFromNow(startMonths + 12) - UTC_DAY_MS,
		interval: '3m',
		cost: 3000
	});
}

// criterion 5 of effort 835
test('a twelve-month quarterly contract is scheduled as four cycles, each due its cost on the first day of its quarter', async () => {
	const api = await createApi();
	const contract = await seedQuarterlyContract(api, 1);

	const cycles = await api.contract.schedule({ id: contract.id });

	assert.deepEqual(
		cycles.map((cycle) => [cycle.index, cycle.due, cycle.amount]),
		[
			[0, firstOfMonthFromNow(1), 3000],
			[1, firstOfMonthFromNow(4), 3000],
			[2, firstOfMonthFromNow(7), 3000],
			[3, firstOfMonthFromNow(10), 3000]
		]
	);
	assert.equal(cycles[0].due, contract.start);
});

// criterion 6(b) of effort 835, first case
test('the schedule allocates every payment oldest first: with today inside the second cycle, 3,000 and 1,000 read paid, late with 1,000 covered, upcoming, upcoming', async () => {
	const api = await createApi();
	const contract = await seedQuarterlyContract(api, -4);

	// recorded newest first, so the order the schedule takes them in is its own and not the
	// order they happened to be written.
	await api.payment.create({
		contractId: contract.id,
		date: firstOfMonthFromNow(-2),
		amount: 1000
	});
	await api.payment.create({
		contractId: contract.id,
		date: contract.start,
		amount: 3000
	});

	const cycles = await api.contract.schedule({ id: contract.id });

	assert.deepEqual(
		cycles.map((cycle) => [cycle.state, cycle.covered, cycle.amount]),
		[
			['paid', 3000, 3000],
			['late', 1000, 3000],
			['upcoming', 0, 3000],
			['upcoming', 0, 3000]
		]
	);
});

test('the schedule of a contract that is not in the workspace is refused', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.contract.schedule({ id: unusedId() }),
		refusedWith('contract.missing')
	);
});

// --- Reminder -------------------------------------------------------------------------
//
// what a WhatsApp reminder states, for each of the three ranks it is offered on (effort 835,
// requirement 12). The message itself is composed and tested in `reminder.test.ts`.

test('an overdue contract’s reminder states everything it owes, since its first unpaid cycle', async () => {
	const api = await createApi();
	const { tenant, contract } = await seedRemindedContract(api, {
		start: monthsFromNow(-13),
		end: monthsFromNow(-1),
		interval: '12m',
		cost: 4000
	});

	assert.deepEqual(await api.contract.reminder({ id: contract.id }), {
		rank: 'overdue',
		tenantName: tenant.name,
		tenantPhone: tenant.phone,
		contractNumber: contract.govId ?? '',
		amount: 4000,
		due: contract.start
	});
});

test('an owing contract’s reminder states what its late and due cycles lack, since the earliest of them', async () => {
	const api = await createApi();
	const { tenant, contract } = await seedRemindedContract(api, {
		start: firstOfMonthFromNow(-3),
		end: firstOfMonthFromNow(9) - UTC_DAY_MS,
		interval: '1m',
		cost: 1000
	});

	// covers the first cycle and half the second, so the four cycles due by now lack 2,500 and
	// the rent has been owed since the second.
	await api.payment.create({
		contractId: contract.id,
		date: firstOfMonthFromNow(-3),
		amount: 1500
	});

	assert.deepEqual(await api.contract.reminder({ id: contract.id }), {
		rank: 'owing',
		tenantName: tenant.name,
		tenantPhone: tenant.phone,
		contractNumber: contract.govId ?? '',
		amount: 2500,
		due: firstOfMonthFromNow(-2)
	});
});

test('a due-soon contract’s reminder states the cycle coming due and the day it falls due', async () => {
	const api = await createApi();
	const { tenant, contract } = await seedRemindedContract(api, {
		start: monthsFromNow(0, 3),
		end: monthsFromNow(12, 2),
		interval: '12m',
		cost: 1500
	});

	assert.deepEqual(await api.contract.reminder({ id: contract.id }), {
		rank: 'due-soon',
		tenantName: tenant.name,
		tenantPhone: tenant.phone,
		contractNumber: contract.govId ?? '',
		amount: 1500,
		due: contract.start
	});
});

test('a contract in no rank, or terminated, has nothing to be reminded of', async () => {
	const api = await createApi();
	const unranked = await seedContract(api, { start: monthsFromNow(2), end: monthsFromNow(14) });
	const terminated = await seedContract(api, {
		start: monthsFromNow(-6),
		end: monthsFromNow(6),
		cost: 2000
	});

	await api.contract.terminate({ id: terminated.id });

	await assert.rejects(
		() => api.contract.reminder({ id: unranked.id }),
		refusedWith('contract.nothingToRemind')
	);
	await assert.rejects(
		() => api.contract.reminder({ id: terminated.id }),
		refusedWith('contract.nothingToRemind')
	);
	await assert.rejects(
		() => api.contract.reminder({ id: unusedId() }),
		refusedWith('contract.missing')
	);
});
