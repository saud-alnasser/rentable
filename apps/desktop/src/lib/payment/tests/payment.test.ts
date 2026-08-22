import assert from 'node:assert/strict';
import test from 'node:test';
import {
	ensureValidPaymentAmount,
	getPaidAmount,
	groupPaymentsByContractId,
	hasValidPaymentAmount,
	isPaymentInTheFuture
} from '../payment.ts';

test('getPaidAmount sums every payment received', () => {
	assert.equal(
		getPaidAmount([
			{ amount: 250, date: 0 },
			{ amount: 750, date: 0 }
		]),
		1000
	);
	assert.equal(getPaidAmount([]), 0);
});

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
	assert.throws(() => ensureValidPaymentAmount(0), /payment amount must be greater than zero/);
	assert.throws(() => ensureValidPaymentAmount(-1), /payment amount must be greater than zero/);
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
