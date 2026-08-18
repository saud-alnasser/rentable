import assert from 'node:assert/strict';
import test from 'node:test';

import { listRows } from '../group.ts';

const payments = [
	{ id: 'p1', month: 'august' },
	{ id: 'p2', month: 'august' },
	{ id: 'p3', month: 'july' }
];

const byMonth = (payment) => ({ key: payment.month, label: payment.month });

test('an ungrouped list is one row per record, in the order it was given', () => {
	assert.deepEqual(
		listRows(payments).map((row) => [row.kind, row.key]),
		[
			['record', 'record:p1'],
			['record', 'record:p2'],
			['record', 'record:p3']
		]
	);
});

test('a header row opens each run of records sharing a group key', () => {
	assert.deepEqual(
		listRows(payments, byMonth).map((row) => [row.kind, row.key]),
		[
			['header', 'group:p1'],
			['record', 'record:p1'],
			['record', 'record:p2'],
			['header', 'group:p3'],
			['record', 'record:p3']
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
		{ id: 'p1', month: 'august' },
		{ id: 'p2', month: 'july' },
		{ id: 'p3', month: 'august' }
	];

	assert.deepEqual(
		listRows(interleaved, byMonth).map((row) => [row.kind, row.key]),
		[
			['header', 'group:p1'],
			['record', 'record:p1'],
			['header', 'group:p2'],
			['record', 'record:p2'],
			['header', 'group:p3'],
			['record', 'record:p3']
		]
	);
});

test('an empty result set produces no rows at all, grouped or not', () => {
	assert.deepEqual(listRows([]), []);
	assert.deepEqual(listRows([], byMonth), []);
});

test('a row carries the one record in it when the list is one record wide', () => {
	assert.deepEqual(
		listRows(payments).map((row) => row.records),
		[[payments[0]], [payments[1]], [payments[2]]]
	);
});

test('a list several records wide fills each row before opening the next', () => {
	assert.deepEqual(
		listRows(payments, undefined, 2).map((row) => row.records.map((record) => record.id)),
		[['p1', 'p2'], ['p3']]
	);
});

test('a row is keyed by the first record in it, so a key never repeats', () => {
	assert.deepEqual(
		listRows(payments, undefined, 2).map((row) => row.key),
		['record:p1', 'record:p3']
	);
});

// a row spanning two groups would sit under whichever header came first and say nothing
// about the records from the group it does not belong to.
test('a group opens a new row rather than filling the one before it', () => {
	assert.deepEqual(
		listRows(payments, byMonth, 2).map((row) =>
			row.kind === 'header' ? row.group.key : row.records.map((record) => record.id)
		),
		['august', ['p1', 'p2'], 'july', ['p3']]
	);
});

test('a width below one record per row is treated as one', () => {
	assert.deepEqual(
		listRows(payments, undefined, 0).map((row) => row.records.map((record) => record.id)),
		[['p1'], ['p2'], ['p3']]
	);
});
