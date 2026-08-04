import assert from 'node:assert/strict';
import test from 'node:test';

import { listRows, stickyGroupRowIndex } from './group.ts';

const payments = [
	{ id: 1, month: 'august' },
	{ id: 2, month: 'august' },
	{ id: 3, month: 'july' }
];

const byMonth = (payment) => ({ key: payment.month, label: payment.month });

test('an ungrouped list is one row per record, in the order it was given', () => {
	assert.deepEqual(
		listRows(payments).map((row) => [row.kind, row.key]),
		[
			['record', 'record:1'],
			['record', 'record:2'],
			['record', 'record:3']
		]
	);
});

test('a header row opens each run of records sharing a group key', () => {
	assert.deepEqual(
		listRows(payments, byMonth).map((row) => [row.kind, row.key]),
		[
			['header', 'group:1'],
			['record', 'record:1'],
			['record', 'record:2'],
			['header', 'group:3'],
			['record', 'record:3']
		]
	);
});

test('a header carries the group its accessor returned', () => {
	const [header] = listRows(payments, byMonth);

	assert.deepEqual(header.group, { key: 'august', label: 'august' });
});

// the query decides the order, and grouping only reads it. A key that comes back later is a
// second group, not a continuation — folding it into the first would move records the query
// deliberately put somewhere else.
test('a group key that returns after another group opens a second group', () => {
	const interleaved = [
		{ id: 1, month: 'august' },
		{ id: 2, month: 'july' },
		{ id: 3, month: 'august' }
	];

	assert.deepEqual(
		listRows(interleaved, byMonth).map((row) => [row.kind, row.key]),
		[
			['header', 'group:1'],
			['record', 'record:1'],
			['header', 'group:2'],
			['record', 'record:2'],
			['header', 'group:3'],
			['record', 'record:3']
		]
	);
});

test('an empty result set produces no rows at all, grouped or not', () => {
	assert.deepEqual(listRows([]), []);
	assert.deepEqual(listRows([], byMonth), []);
});

test('the header that stays put is the last one at or above the first visible row', () => {
	const rows = listRows(payments, byMonth);

	assert.equal(stickyGroupRowIndex(rows, 1), 0);
	assert.equal(stickyGroupRowIndex(rows, 2), 0);
	assert.equal(stickyGroupRowIndex(rows, 4), 3);
});

test('a header scrolled to exactly is the one that stays put', () => {
	const rows = listRows(payments, byMonth);

	assert.equal(stickyGroupRowIndex(rows, 3), 3);
});

test('nothing stays put above the first header, or in a list with none', () => {
	assert.equal(stickyGroupRowIndex(listRows(payments), 1), null);
	assert.equal(stickyGroupRowIndex([], 0), null);
});
