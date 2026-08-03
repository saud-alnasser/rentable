import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureValidPaymentAmount, getPaidAmount, groupPaymentsByContractId } from './payment.ts';

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
		{ id: 1, contractId: 7 },
		{ id: 2, contractId: 9 },
		{ id: 3, contractId: 7 }
	]);

	assert.deepEqual(
		grouped.get(7).map((payment) => payment.id),
		[1, 3]
	);
	assert.deepEqual(
		grouped.get(9).map((payment) => payment.id),
		[2]
	);
	assert.equal(grouped.get(11), undefined);
});

test('ensureValidPaymentAmount rejects an amount that is not positive', () => {
	assert.throws(() => ensureValidPaymentAmount(0), /payment amount must be greater than zero/);
	assert.throws(() => ensureValidPaymentAmount(-1), /payment amount must be greater than zero/);
	assert.doesNotThrow(() => ensureValidPaymentAmount(0.01));
});
