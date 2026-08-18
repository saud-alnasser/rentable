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
		{ id: 'p1', contractId: 'c7' },
		{ id: 'p2', contractId: 'c9' },
		{ id: 'p3', contractId: 'c7' }
	]);

	assert.deepEqual(
		grouped.get('c7').map((payment) => payment.id),
		['p1', 'p3']
	);
	assert.deepEqual(
		grouped.get('c9').map((payment) => payment.id),
		['p2']
	);
	assert.equal(grouped.get('c11'), undefined);
});

test('ensureValidPaymentAmount rejects an amount that is not positive', () => {
	assert.throws(() => ensureValidPaymentAmount(0), /payment amount must be greater than zero/);
	assert.throws(() => ensureValidPaymentAmount(-1), /payment amount must be greater than zero/);
	assert.doesNotThrow(() => ensureValidPaymentAmount(0.01));
});
