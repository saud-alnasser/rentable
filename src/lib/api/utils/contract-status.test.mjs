import assert from 'node:assert/strict';
import test from 'node:test';
import {
	canManuallyTerminateContractStatus,
	canUnterminateContractStatus,
	countExpectedPaymentsInRange,
	deriveContractStatus,
	deriveUnitStatus,
	getConflictingAssignedUnitIds,
	getContractPaymentSummary,
	getExpectedAmountInRange,
	getOutstandingExpectedAmount,
	hasSameUtcDateRange,
	hasSatisfiedContractPaymentRequirement,
	hasValidContractPeriodForInterval,
	rangesOverlap
} from './contract-status.ts';

test('hasSameUtcDateRange treats matching UTC calendar dates as unchanged', () => {
	assert.equal(
		hasSameUtcDateRange(
			new Date('2026-01-10T00:00:00.000Z'),
			new Date('2026-01-20T23:59:59.999Z'),
			new Date('2026-01-10T12:30:00.000Z').getTime(),
			new Date('2026-01-20T01:15:00.000Z').getTime()
		),
		true
	);
});

test('rangesOverlap compares ranges by normalized UTC day', () => {
	assert.equal(
		rangesOverlap(
			new Date('2026-01-10T22:00:00.000Z'),
			new Date('2026-01-20T01:00:00.000Z'),
			new Date('2026-01-20T23:00:00.000Z').getTime(),
			new Date('2026-01-25T00:00:00.000Z').getTime()
		),
		true
	);
});

test('getConflictingAssignedUnitIds only keeps units from overlapping other contracts', () => {
	const conflictingUnitIds = getConflictingAssignedUnitIds(
		[
			{
				unitId: 1,
				contractId: 10,
				status: 'active',
				start: new Date('2026-01-05T12:00:00.000Z'),
				end: new Date('2026-01-12T08:00:00.000Z')
			},
			{
				unitId: 2,
				contractId: 11,
				status: 'active',
				start: new Date('2026-01-21T00:00:00.000Z'),
				end: new Date('2026-01-31T00:00:00.000Z')
			},
			{
				unitId: 3,
				contractId: 99,
				status: 'active',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-01-20T00:00:00.000Z')
			},
			{
				unitId: 4,
				contractId: 12,
				status: 'terminated',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-01-20T00:00:00.000Z')
			},
			{
				unitId: 5,
				contractId: 13,
				status: 'defaulted',
				start: new Date('2026-01-20T23:59:59.000Z'),
				end: new Date('2026-02-01T00:00:00.000Z')
			},
			{
				unitId: 1,
				contractId: 14,
				status: 'active',
				start: new Date('2026-01-15T00:00:00.000Z'),
				end: new Date('2026-01-18T00:00:00.000Z')
			}
		],
		{
			start: new Date('2026-01-10T00:00:00.000Z').getTime(),
			end: new Date('2026-01-20T00:00:00.000Z').getTime()
		},
		99
	);

	assert.deepEqual(
		[...conflictingUnitIds].sort((left, right) => left - right),
		[1, 5]
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

test('countExpectedPaymentsInRange counts only installments due inside the provided month', () => {
	assert.equal(
		countExpectedPaymentsInRange(
			{
				status: 'active',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-04-09T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			new Date('2026-02-01T00:00:00.000Z'),
			new Date('2026-02-28T00:00:00.000Z')
		),
		1
	);
});

test('getExpectedAmountInRange returns the scheduled amount due inside the provided range', () => {
	assert.equal(
		getExpectedAmountInRange(
			{
				status: 'active',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-04-09T00:00:00.000Z'),
				interval: '1m',
				cost: 1250
			},
			new Date('2026-03-01T00:00:00.000Z'),
			new Date('2026-03-31T00:00:00.000Z')
		),
		1250
	);
});

test('getExpectedAmountInRange excludes installments scheduled later than the range end', () => {
	assert.equal(
		getExpectedAmountInRange(
			{
				status: 'active',
				start: new Date('2026-01-20T00:00:00.000Z'),
				end: new Date('2026-04-19T00:00:00.000Z'),
				interval: '1m',
				cost: 1250
			},
			new Date('2026-02-01T00:00:00.000Z'),
			new Date('2026-02-10T00:00:00.000Z')
		),
		0
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

test('hasValidContractPeriodForInterval accepts exact 30-day monthly periods on arbitrary start dates', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-03-10T00:00:00.000Z'),
			end: new Date('2026-04-08T00:00:00.000Z'),
			interval: '1m'
		}),
		true
	);
});

test('hasValidContractPeriodForInterval rejects periods that are not a whole number of fixed 30-day cycles', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-03-10T00:00:00.000Z'),
			end: new Date('2026-04-09T00:00:00.000Z'),
			interval: '1m'
		}),
		false
	);
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-01T00:00:00.000Z'),
			end: new Date('2026-04-15T00:00:00.000Z'),
			interval: '3m'
		}),
		false
	);
});

test('hasValidContractPeriodForInterval accepts longer annual terms on non-first-of-month dates', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-12T00:00:00.000Z'),
			end: new Date('2027-01-06T00:00:00.000Z'),
			interval: '12m'
		}),
		true
	);
});

test('hasValidContractPeriodForInterval rejects periods shorter than the selected interval cycle', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-12T00:00:00.000Z'),
			end: new Date('2026-02-07T00:00:00.000Z'),
			interval: '1m'
		}),
		false
	);

	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-01T00:00:00.000Z'),
			end: new Date('2026-03-24T00:00:00.000Z'),
			interval: '3m'
		}),
		false
	);

	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-01T00:00:00.000Z'),
			end: new Date('2026-12-25T00:00:00.000Z'),
			interval: '12m'
		}),
		false
	);
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

test('deriveUnitStatus keeps fulfilled in-range contracts occupied', () => {
	assert.equal(
		deriveUnitStatus(
			[
				{
					contract: {
						status: 'active',
						start: new Date('2026-01-01T00:00:00.000Z'),
						end: new Date('2026-02-28T00:00:00.000Z'),
						interval: '1m',
						cost: 1000
					},
					payments: [
						{
							amount: 2000,
							date: new Date('2026-01-01T00:00:00.000Z')
						}
					]
				}
			],
			new Date('2026-01-15T00:00:00.000Z').getTime()
		),
		'occupied'
	);
});

test('deriveUnitStatus calculates current status from the active timeframe', () => {
	assert.equal(
		deriveUnitStatus(
			[
				{
					contract: {
						status: 'active',
						start: new Date('2026-01-01T00:00:00.000Z'),
						end: new Date('2026-01-10T00:00:00.000Z'),
						interval: '1m',
						cost: 1000
					},
					payments: []
				}
			],
			new Date('2026-02-01T00:00:00.000Z').getTime()
		),
		'vacant'
	);
});

test('deriveUnitStatus does not mark a scheduled contract as occupied before it starts', () => {
	assert.equal(
		deriveUnitStatus(
			[
				{
					contract: {
						status: 'active',
						start: new Date('2026-03-10T00:00:00.000Z'),
						end: new Date('2026-03-31T00:00:00.000Z'),
						interval: '1m',
						cost: 1000
					},
					payments: []
				}
			],
			new Date('2026-03-01T00:00:00.000Z').getTime()
		),
		'vacant'
	);
});
