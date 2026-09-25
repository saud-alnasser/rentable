import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContractLike } from '$lib/contract/contract.ts';
import type { SchedulePaymentLike } from '$lib/contract/schedule.ts';
import { newId } from '$lib/platform/database/identity.ts';
import { allocateReceipt, toReceiptReference } from '$lib/payment/receipt.ts';

/**
 * A PAYMENT'S RECEIPT, AS THE RECORD STATES IT
 *
 * Ticket 06 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 9:
 * the reference that identifies one payment and no other (criterion 9(b)), the cycles a payment
 * covers (9(d)), and what remains of the contract's total cost after it.
 */

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** a UUIDv7 written out: the timestamp in milliseconds, the counter, and a random tail. */
function uuid(at: number, counter: number, tail = '8123456789abcdef') {
	const hex =
		at.toString(16).padStart(12, '0') + '7' + counter.toString(16).padStart(3, '0') + tail;

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

test('a receipt reference is sixteen Crockford characters in four groups', () => {
	const reference = toReceiptReference(newId());

	assert.match(reference, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
});

test('the same payment always gives the same reference', () => {
	const id = newId();

	assert.equal(toReceiptReference(id), toReceiptReference(id));
});

test('two payments a millisecond apart, or a counter apart, never share a reference', () => {
	const at = Date.UTC(2026, 8, 25, 9, 30);
	const first = toReceiptReference(uuid(at, 0x123));

	assert.notEqual(first, toReceiptReference(uuid(at + 1, 0x123)));
	assert.notEqual(first, toReceiptReference(uuid(at, 0x124)));
});

test('two payments with different last bits in one millisecond and counter do not share one', () => {
	const at = Date.UTC(2026, 8, 25, 9, 30);

	assert.notEqual(
		toReceiptReference(uuid(at, 0x123, '8123456789abcdef')),
		toReceiptReference(uuid(at, 0x123, '8123456789abcdee'))
	);
});

// migration 0003 rewrote every older id as one timestamp, counter 5, a zeroed tail and the old row
// number in the last 48 bits (`0003_serious_synch.sql`). Those payments differ only there.
test('payments migrated from row numbers each keep a reference of their own', () => {
	const migrated = (rowId: number) =>
		`0198c0b8-e700-7005-8000-${rowId.toString(16).padStart(12, '0')}`;
	const references = new Set(
		[1, 2, 300, 4096, 99999].map((rowId) => toReceiptReference(migrated(rowId)))
	);

	assert.equal(references.size, 5);
});

test('ids minted one after another give distinct references', () => {
	const references = new Set(Array.from({ length: 2000 }, () => toReceiptReference(newId())));

	assert.equal(references.size, 2000);
});

/** four quarterly cycles of 3,000, a total cost of 12,000. */
const QUARTERLY: ContractLike = {
	status: 'active',
	start: day('2026-01-01'),
	end: day('2026-12-31'),
	interval: '3m',
	cost: 3000
};

test('a payment covering the second cycle and part of the third names both', () => {
	const payments: SchedulePaymentLike[] = [
		{ id: uuid(1, 1), date: day('2026-01-01'), amount: 3000 },
		{ id: uuid(2, 1), date: day('2026-04-01'), amount: 4500 }
	];

	const { cycles } = allocateReceipt(QUARTERLY, payments, payments[1].id, day('2026-05-10'));

	assert.deepEqual(
		cycles.map((cycle) => [cycle.index, cycle.due.toISOString().slice(0, 10)]),
		[
			[1, '2026-04-01'],
			[2, '2026-07-01']
		]
	);
});

test('what remains counts this payment and every one the allocation takes before it', () => {
	// recorded in the order listed, so the one dated March is taken before the one dated February
	// only by date: the allocation's order, not the order they arrive in.
	const payments: SchedulePaymentLike[] = [
		{ id: uuid(1, 1), date: day('2026-03-01'), amount: 2000 },
		{ id: uuid(2, 1), date: day('2026-02-01'), amount: 1000 },
		{ id: uuid(3, 1), date: day('2026-04-01'), amount: 500 }
	];
	const remainingAfter = (id: string) =>
		allocateReceipt(QUARTERLY, payments, id, day('2026-05-10')).remaining;

	assert.equal(remainingAfter(payments[1].id), 11000);
	assert.equal(remainingAfter(payments[0].id), 9000);
	assert.equal(remainingAfter(payments[2].id), 8500);
});

test('what remains is never below nothing, and money past the total covers no cycle', () => {
	const payments: SchedulePaymentLike[] = [
		{ id: uuid(1, 1), date: day('2026-01-01'), amount: 12000 },
		{ id: uuid(2, 1), date: day('2026-02-01'), amount: 500 }
	];
	const receipt = allocateReceipt(QUARTERLY, payments, payments[1].id, day('2026-05-10'));

	assert.equal(receipt.remaining, 0);
	assert.deepEqual(receipt.cycles, []);
});

test("a terminated contract's payment still has its cycles and remainder", () => {
	const payments: SchedulePaymentLike[] = [
		{ id: uuid(1, 1), date: day('2026-01-01'), amount: 3000 }
	];
	const receipt = allocateReceipt(
		{ ...QUARTERLY, status: 'terminated' },
		payments,
		payments[0].id,
		day('2026-05-10')
	);

	assert.deepEqual(
		receipt.cycles.map((cycle) => cycle.index),
		[0]
	);
	assert.equal(receipt.remaining, 9000);
});
