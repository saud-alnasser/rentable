import assert from 'node:assert/strict';
import test from 'node:test';

import { toTransferredUnitIds } from '../unit-transfer.ts';

test('a unit moved out of the available pane joins the set', () => {
	assert.deepEqual(toTransferredUnitIds([3, 7], 9, false), [3, 7, 9]);
});

test('a unit moved out of the assigned pane leaves the set', () => {
	assert.deepEqual(toTransferredUnitIds([3, 7, 9], 7, true), [3, 9]);
});

// both panes are one read of the same rows, so a unit cannot be on both sides — but the set is
// what the write commits, and a duplicate in it would be the contract holding a unit twice.
test('adding a unit the contract already holds changes nothing', () => {
	assert.deepEqual(toTransferredUnitIds([3, 7], 7, false), [3, 7]);
});

test('removing a unit the contract does not hold changes nothing', () => {
	assert.deepEqual(toTransferredUnitIds([3, 7], 9, true), [3, 7]);
});

test('the units the transfer did not touch keep their order', () => {
	assert.deepEqual(toTransferredUnitIds([9, 3, 7], 3, true), [9, 7]);
});

test('a contract holding nothing takes its first unit', () => {
	assert.deepEqual(toTransferredUnitIds([], 4, false), [4]);
});

test('a contract gives up its last unit', () => {
	assert.deepEqual(toTransferredUnitIds([4], 4, true), []);
});
