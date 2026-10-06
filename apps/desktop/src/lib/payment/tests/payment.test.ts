import assert from 'node:assert/strict';
import { refusedWith } from '$lib/app/tests/testing.ts';
import test from 'node:test';
import {
	ensurePaymentWritable,
	ensureValidPaymentAmount,
	groupPaymentsByContractId,
	hasValidPaymentAmount,
	isPaymentInTheFuture,
	type PaymentWrite
} from '../payment.ts';

test('groupPaymentsByContractId keeps row order within each contract', () => {
	const grouped = groupPaymentsByContractId([
		{ id: 'p1', contractId: 'c7' },
		{ id: 'p2', contractId: 'c9' },
		{ id: 'p3', contractId: 'c7' }
	]);

	assert.deepEqual(
		grouped.get('c7')?.map((payment) => payment.id),
		['p1', 'p3']
	);
	assert.deepEqual(
		grouped.get('c9')?.map((payment) => payment.id),
		['p2']
	);
	assert.equal(grouped.get('c11'), undefined);
});

test('ensureValidPaymentAmount rejects an amount that is not positive', () => {
	assert.throws(() => ensureValidPaymentAmount(0), refusedWith('payment.amountNotPositive'));
	assert.throws(() => ensureValidPaymentAmount(-1), refusedWith('payment.amountNotPositive'));
	assert.doesNotThrow(() => ensureValidPaymentAmount(0.01));
});

// The two rules the transfer planning pass now asks as well as the procedures, covered directly
// rather than only through either. Both were restated in the planner and both restatements were
// wrong: the amount was read as `< 0`, which admits a payment of nothing, and the date was not
// read at all, which is what let a file plan as importable and then be refused whole at the write.
test('hasValidPaymentAmount admits an amount a payment may be for and nothing else', () => {
	assert.equal(hasValidPaymentAmount(0.01), true);
	assert.equal(hasValidPaymentAmount(1500), true);

	// the boundary is the whole of the rule
	assert.equal(hasValidPaymentAmount(0), false);
	assert.equal(hasValidPaymentAmount(-500), false);
});

test('isPaymentInTheFuture compares whole UTC days, so the day itself is not future', () => {
	const day = Date.UTC(2026, 5, 15);

	assert.equal(isPaymentInTheFuture(day + 86_400_000, day), true);
	assert.equal(isPaymentInTheFuture(day, day), false);
	assert.equal(isPaymentInTheFuture(day - 86_400_000, day), false);

	// the time of day on either side decides nothing, which is what keeps the answer the same
	// whatever timezone the machine is in
	assert.equal(isPaymentInTheFuture(day + 23 * 3_600_000, day), false);
	assert.equal(isPaymentInTheFuture(day, day + 23 * 3_600_000), false);
});

// ticket 33 of effort 854: whether a payment may be written is asked of one rule, whichever
// procedure writes it, so the lock a refund escapes and the limit it keeps are stated once.
test('ensurePaymentWritable locks a payment received on a terminated contract, never a refund', () => {
	const terminated = {
		status: 'terminated' as const,
		start: new Date('2026-01-01T00:00:00.000Z'),
		end: new Date('2026-12-31T00:00:00.000Z'),
		interval: '12m' as const,
		cost: 100000
	};
	const received = { amount: 5000, date: 0 };
	const refund = { amount: 3000, date: 0, direction: 'refund' as const };

	for (const write of [
		{ act: 'create', payments: [{ amount: 1, date: 0 }] },
		{ act: 'update', payment: received, amount: 4000 },
		{ act: 'delete', payment: received }
	] satisfies PaymentWrite[]) {
		assert.throws(
			() => ensurePaymentWritable(terminated, [refund], write),
			refusedWith('contract.terminatedLocked')
		);
	}

	assert.doesNotThrow(() =>
		ensurePaymentWritable(terminated, [received], { act: 'create', payments: [refund] })
	);
	assert.doesNotThrow(() =>
		ensurePaymentWritable(terminated, [received], { act: 'update', payment: refund, amount: 5000 })
	);
	assert.doesNotThrow(() =>
		ensurePaymentWritable(terminated, [received], { act: 'delete', payment: refund })
	);
	assert.throws(
		() =>
			ensurePaymentWritable(terminated, [received], {
				act: 'update',
				payment: refund,
				amount: 5001
			}),
		refusedWith('contract.refundAboveLimit', { limit: 5000 })
	);
});

test('ensurePaymentWritable weighs refunds put back together, and never refuses lowering one', () => {
	const live = {
		status: 'active' as const,
		start: new Date('2026-01-01T00:00:00.000Z'),
		end: new Date('2026-12-31T00:00:00.000Z'),
		interval: '12m' as const,
		cost: 12000
	};
	const received = { amount: 13000, date: 0 };
	const refund = (amount: number) => ({ amount, date: 0, direction: 'refund' as const });

	// 1,000 beyond the total, so two refunds of 600 put back together are past it.
	assert.throws(
		() =>
			ensurePaymentWritable(live, [received], {
				act: 'create',
				payments: [refund(600), refund(600)]
			}),
		refusedWith('contract.refundAboveLimit', { limit: 1000 })
	);
	// and the payment received put back with them counts toward what may be returned.
	assert.doesNotThrow(() =>
		ensurePaymentWritable(live, [], { act: 'create', payments: [received, refund(1000)] })
	);

	// a restored contract holding 3,000 returned of 5,000 received may return nothing more, and a
	// refund it holds is still lowered.
	const restored = [{ amount: 5000, date: 0 }];

	assert.doesNotThrow(() =>
		ensurePaymentWritable(live, restored, { act: 'update', payment: refund(3000), amount: 2000 })
	);
	assert.throws(
		() =>
			ensurePaymentWritable(live, restored, { act: 'update', payment: refund(3000), amount: 3001 }),
		refusedWith('contract.refundAboveLimit', { limit: 3000 })
	);
});

// ticket 40 of effort 854: a write an undo or a redo replays is weighed only that refunds stay
// within what was received, so a restored contract's refund goes back to what was recorded.
test('ensurePaymentWritable weighs a replayed refund only against what was received', () => {
	const live = {
		status: 'active' as const,
		start: new Date('2026-01-01T00:00:00.000Z'),
		end: new Date('2026-12-31T00:00:00.000Z'),
		interval: '12m' as const,
		cost: 100000
	};
	const restored = [{ amount: 5000, date: 0 }];
	const refund = (amount: number) => ({ amount, date: 0, direction: 'refund' as const });

	assert.doesNotThrow(() =>
		ensurePaymentWritable(live, restored, {
			act: 'update',
			payment: refund(2000),
			amount: 3000,
			replay: true
		})
	);
	assert.doesNotThrow(() =>
		ensurePaymentWritable(live, restored, { act: 'create', payments: [refund(3000)], replay: true })
	);
	assert.throws(
		() =>
			ensurePaymentWritable(live, restored, {
				act: 'update',
				payment: refund(2000),
				amount: 5001,
				replay: true
			}),
		refusedWith('contract.refundsExceedReceived')
	);
	assert.throws(
		() =>
			ensurePaymentWritable(live, restored, {
				act: 'create',
				payments: [refund(5001)],
				replay: true
			}),
		refusedWith('contract.refundsExceedReceived')
	);
	// the same writes by hand keep the limit by state.
	assert.throws(
		() =>
			ensurePaymentWritable(live, restored, { act: 'update', payment: refund(2000), amount: 3000 }),
		refusedWith('contract.refundAboveLimit', { limit: 2000 })
	);
});
