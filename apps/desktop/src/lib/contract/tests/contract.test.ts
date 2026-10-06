import assert from 'node:assert/strict';
import test from 'node:test';
import {
	canManuallyTerminateContractStatus,
	canUnterminateContractStatus,
	deriveContractStatus,
	getAmountDueThisCycle,
	getContractPaymentSummary,
	getOutstandingExpectedAmount,
	getPaidAmount,
	getReceivedAmount,
	getRefundableAmount,
	getRefundedAmount,
	getRemainingContractBalance,
	isContractPaidInFull,
	hasSatisfiedContractPaymentRequirement,
	hasValidContractCost
} from '../contract.ts';

// moved from the payment's tests with the sum it covers: what payments add up to is the contract's
// arithmetic, since the payment depends on the contract (effort 840, ticket 62).
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

// effort 854, requirement 27: what a contract counts as paid is what it received less what it
// returned. A payment that names no direction is received, as the column's default reads it.
const REFUNDED = [
	{ amount: 3000, date: 0 },
	{ amount: 1000, date: 0, direction: 'received' as const },
	{ amount: 1500, date: 0, direction: 'refund' as const }
];

test('getReceivedAmount and getRefundedAmount each sum one direction, and getPaidAmount is the net', () => {
	assert.equal(getReceivedAmount(REFUNDED), 4000);
	assert.equal(getRefundedAmount(REFUNDED), 1500);
	assert.equal(getPaidAmount(REFUNDED), 2500);
	assert.deepEqual([getReceivedAmount([]), getRefundedAmount([])], [0, 0]);
});

// the limit ticket 22 enforces: a live contract returns only what it received past its total
// cost, and a terminated one up to what it received, each less what it already returned.
test('getRefundableAmount is the surplus on a live contract and everything received on a terminated one', () => {
	const live = {
		status: 'active' as const,
		start: new Date('2026-01-01T00:00:00.000Z'),
		end: new Date('2026-12-31T00:00:00.000Z'),
		interval: '12m' as const,
		cost: 3000
	};

	assert.equal(getRefundableAmount(live, REFUNDED), 0);
	assert.equal(getRefundableAmount(live, [{ amount: 5000, date: 0 }]), 2000);
	assert.equal(
		getRefundableAmount(live, [
			{ amount: 5000, date: 0 },
			{ amount: 500, date: 0, direction: 'refund' }
		]),
		1500
	);
	assert.equal(getRefundableAmount({ ...live, status: 'terminated' }, REFUNDED), 2500);
});

test('a refund takes a contract out of paid in full, and its status follows the net', () => {
	const contract = {
		status: 'active' as const,
		start: new Date('2026-01-01T00:00:00.000Z'),
		end: new Date('2026-01-30T00:00:00.000Z'),
		interval: '1m' as const,
		cost: 1000
	};
	const refunded = [
		{ amount: 1000, date: new Date('2026-01-01T00:00:00.000Z') },
		{ amount: 400, date: new Date('2026-01-05T00:00:00.000Z'), direction: 'refund' as const }
	];
	const after = new Date('2026-02-01T00:00:00.000Z').getTime();

	assert.equal(isContractPaidInFull(contract, refunded), false);
	assert.equal(deriveContractStatus(contract, refunded, after), 'defaulted');
	assert.equal(getOutstandingExpectedAmount(contract, refunded, after), 400);
	assert.equal(
		deriveContractStatus(
			{ ...contract, status: 'terminated' },
			[
				...refunded,
				{ amount: 600, date: new Date('2026-01-06T00:00:00.000Z'), direction: 'refund' as const }
			],
			after
		),
		'terminated'
	);
});

test('deriveContractStatus returns scheduled before the contract start date', () => {
	assert.equal(
		deriveContractStatus(
			{
				status: 'active',
				start: new Date('2026-03-10T00:00:00.000Z'),
				end: new Date('2026-03-31T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			[],
			new Date('2026-03-01T00:00:00.000Z').getTime()
		),
		'scheduled'
	);
});

test('deriveContractStatus returns fulfilled during the contract term when fully paid', () => {
	assert.equal(
		deriveContractStatus(
			{
				status: 'active',
				start: new Date('2026-01-01T00:00:00.000Z'),
				end: new Date('2026-02-28T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			[
				{
					amount: 2000,
					date: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			new Date('2026-01-15T00:00:00.000Z').getTime()
		),
		'fulfilled'
	);
});

test('deriveContractStatus returns expired after the end date when fully paid', () => {
	assert.equal(
		deriveContractStatus(
			{
				status: 'active',
				start: new Date('2026-01-01T00:00:00.000Z'),
				end: new Date('2026-01-30T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			[
				{
					amount: 1000,
					date: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			new Date('2026-02-01T00:00:00.000Z').getTime()
		),
		'expired'
	);
});

test('deriveContractStatus returns defaulted after the end date when underpaid', () => {
	assert.equal(
		deriveContractStatus(
			{
				status: 'active',
				start: new Date('2026-01-01T00:00:00.000Z'),
				end: new Date('2026-01-30T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			[],
			new Date('2026-02-01T00:00:00.000Z').getTime()
		),
		'defaulted'
	);
});

test('getContractPaymentSummary returns paid and expected amounts for the contract term', () => {
	assert.deepEqual(
		getContractPaymentSummary(
			{
				status: 'active',
				start: new Date('2026-01-01T00:00:00.000Z'),
				end: new Date('2026-03-31T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			[
				{
					amount: 1000,
					date: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					amount: 500,
					date: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		),
		{ paidAmount: 1500, expectedAmount: 3000 }
	);
});

test('getContractPaymentSummary keeps fixed 30-day cycle totals aligned with validation', () => {
	assert.deepEqual(
		getContractPaymentSummary(
			{
				status: 'active',
				start: new Date('2026-01-01T00:00:00.000Z'),
				end: new Date('2027-12-21T00:00:00.000Z'),
				interval: '12m',
				cost: 1000
			},
			[
				{
					amount: 500,
					date: new Date('2026-01-01T00:00:00.000Z')
				}
			]
		),
		{ paidAmount: 500, expectedAmount: 2000 }
	);
});

test('getOutstandingExpectedAmount returns the unpaid amount currently due', () => {
	assert.equal(
		getOutstandingExpectedAmount(
			{
				status: 'active',
				start: new Date('2026-01-01T00:00:00.000Z'),
				end: new Date('2026-03-31T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			[
				{
					amount: 500,
					date: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			new Date('2026-02-15T00:00:00.000Z').getTime()
		),
		1500
	);
});

test('hasSatisfiedContractPaymentRequirement locks by required amount, not payment count', () => {
	assert.equal(hasSatisfiedContractPaymentRequirement(1000, 1000), true);
	assert.equal(hasSatisfiedContractPaymentRequirement(1000.00005, 1000), true);
	assert.equal(hasSatisfiedContractPaymentRequirement(999.99, 1000), false);
});

test('getRemainingContractBalance measures the aggregates against each other', () => {
	assert.equal(getRemainingContractBalance(400, 1000), 600);
	assert.equal(getRemainingContractBalance(0, 1000), 1000);
});

test('getRemainingContractBalance owes nothing once the requirement is satisfied', () => {
	assert.equal(getRemainingContractBalance(1000, 1000), 0);
	assert.equal(getRemainingContractBalance(1200, 1000), 0);
	// the same float dust the requirement tolerates is not a debt either
	assert.equal(getRemainingContractBalance(999.99995, 1000), 0);
});

test('canManuallyTerminateContractStatus only allows active and past contracts', () => {
	assert.equal(canManuallyTerminateContractStatus('scheduled'), false);
	assert.equal(canManuallyTerminateContractStatus('active'), true);
	assert.equal(canManuallyTerminateContractStatus('fulfilled'), true);
	assert.equal(canManuallyTerminateContractStatus('expired'), true);
	assert.equal(canManuallyTerminateContractStatus('defaulted'), true);
	assert.equal(canManuallyTerminateContractStatus('terminated'), false);
});

test('canUnterminateContractStatus only allows terminated contracts', () => {
	assert.equal(canUnterminateContractStatus('scheduled'), false);
	assert.equal(canUnterminateContractStatus('active'), false);
	assert.equal(canUnterminateContractStatus('fulfilled'), false);
	assert.equal(canUnterminateContractStatus('expired'), false);
	assert.equal(canUnterminateContractStatus('defaulted'), false);
	assert.equal(canUnterminateContractStatus('terminated'), true);
});

// The cost rule, covered directly rather than only through the procedures that assert it. It is a
// one-liner, and the reason it is a function at all is that it was briefly two: the transfer
// planning pass read it as `< 0` and admitted a contract worth nothing, which has a total cost of
// nothing, satisfies every payment requirement by nothing, and reconciles to `fulfilled` having
// taken no money.
test('hasValidContractCost admits an amount a contract may cost and nothing else', () => {
	assert.equal(hasValidContractCost(1), true);
	assert.equal(hasValidContractCost(0.01), true);
	assert.equal(hasValidContractCost(18_000), true);

	// the boundary is the whole of the rule
	assert.equal(hasValidContractCost(0), false);
	assert.equal(hasValidContractCost(-1), false);
});

// requirement 16 of effort 832: the payment form opens with the amount due this cycle, capped at
// what the contract still owes.
const monthly = {
	status: 'active' as const,
	start: new Date('2026-01-01T00:00:00.000Z'),
	end: new Date('2026-12-31T00:00:00.000Z'),
	interval: '1m' as const,
	cost: 1500,
	expectedAmount: 18000
};
const midMarch = new Date('2026-03-15T00:00:00.000Z');

test('getAmountDueThisCycle is the cycle rent where a cycle or more is unpaid', () => {
	assert.equal(getAmountDueThisCycle({ ...monthly, paidAmount: 0 }, midMarch), 1500);
});

test('getAmountDueThisCycle is the unpaid part where the cycle is part paid', () => {
	assert.equal(getAmountDueThisCycle({ ...monthly, paidAmount: 4000 }, midMarch), 500);
});

test('getAmountDueThisCycle is the next cycle rent where the reader is paying ahead', () => {
	assert.equal(getAmountDueThisCycle({ ...monthly, paidAmount: 4500 }, midMarch), 1500);
});

test('getAmountDueThisCycle is capped at what the contract still owes', () => {
	assert.equal(getAmountDueThisCycle({ ...monthly, paidAmount: 17000 }, midMarch), 1000);
	assert.equal(getAmountDueThisCycle({ ...monthly, paidAmount: 18000 }, midMarch), 0);
});

test('getAmountDueThisCycle rounds to the halala', () => {
	assert.equal(
		getAmountDueThisCycle(
			{ ...monthly, cost: 1000.1, expectedAmount: 12001.2, paidAmount: 0.3 },
			new Date('2026-01-15T00:00:00.000Z')
		),
		999.8
	);
});
