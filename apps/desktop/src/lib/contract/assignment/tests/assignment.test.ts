import assert from 'node:assert/strict';
import test from 'node:test';

import {
	deriveUnitStatus,
	getConflictingAssignedUnitIds,
	hasSameUtcDateRange,
	rangesOverlap,
	toTransferredUnitIds
} from '../assignment.ts';

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
				unitId: 'u1',
				contractId: 'c10',
				status: 'active',
				start: new Date('2026-01-05T12:00:00.000Z'),
				end: new Date('2026-01-12T08:00:00.000Z')
			},
			{
				unitId: 'u2',
				contractId: 'c11',
				status: 'active',
				start: new Date('2026-01-21T00:00:00.000Z'),
				end: new Date('2026-01-31T00:00:00.000Z')
			},
			{
				unitId: 'u3',
				contractId: 'c99',
				status: 'active',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-01-20T00:00:00.000Z')
			},
			{
				unitId: 'u4',
				contractId: 'c12',
				status: 'terminated',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-01-20T00:00:00.000Z')
			},
			{
				unitId: 'u5',
				contractId: 'c13',
				status: 'defaulted',
				start: new Date('2026-01-20T23:59:59.000Z'),
				end: new Date('2026-02-01T00:00:00.000Z')
			},
			{
				unitId: 'u1',
				contractId: 'c14',
				status: 'active',
				start: new Date('2026-01-15T00:00:00.000Z'),
				end: new Date('2026-01-18T00:00:00.000Z')
			}
		],
		{
			start: new Date('2026-01-10T00:00:00.000Z').getTime(),
			end: new Date('2026-01-20T00:00:00.000Z').getTime()
		},
		'c99'
	);

	assert.deepEqual([...conflictingUnitIds].sort(), ['u1', 'u5']);
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

test('a unit moved out of the available pane joins the set', () => {
	assert.deepEqual(toTransferredUnitIds(['3', '7'], '9', false), ['3', '7', '9']);
});

test('a unit moved out of the assigned pane leaves the set', () => {
	assert.deepEqual(toTransferredUnitIds(['3', '7', '9'], '7', true), ['3', '9']);
});

// both panes are one read of the same rows, so a unit cannot be on both sides — but the set is
// what the write commits, and a duplicate in it would be the contract holding a unit twice.
test('adding a unit the contract already holds changes nothing', () => {
	assert.deepEqual(toTransferredUnitIds(['3', '7'], '7', false), ['3', '7']);
});

test('removing a unit the contract does not hold changes nothing', () => {
	assert.deepEqual(toTransferredUnitIds(['3', '7'], '9', true), ['3', '7']);
});

test('the units the transfer did not touch keep their order', () => {
	assert.deepEqual(toTransferredUnitIds(['9', '3', '7'], '3', true), ['9', '7']);
});

test('a contract holding nothing takes its first unit', () => {
	assert.deepEqual(toTransferredUnitIds([], '4', false), ['4']);
});

test('a contract gives up its last unit', () => {
	assert.deepEqual(toTransferredUnitIds(['4'], '4', true), []);
});
