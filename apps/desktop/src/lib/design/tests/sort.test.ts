import assert from 'node:assert/strict';
import test from 'node:test';

import { nextListSort } from '../sort.ts';

const sortable = ['name', 'units'];

test('a column the list is not ordered by starts ascending', () => {
	assert.deepEqual(nextListSort(null, 'name', sortable), { columnId: 'name', direction: 'asc' });
});

test('moving to another sortable column starts it ascending too', () => {
	const current = { columnId: 'name', direction: 'desc' };

	assert.deepEqual(nextListSort(current, 'units', sortable), {
		columnId: 'units',
		direction: 'asc'
	});
});

test('the column already ascending reverses', () => {
	const current = { columnId: 'name', direction: 'asc' };

	assert.deepEqual(nextListSort(current, 'name', sortable), {
		columnId: 'name',
		direction: 'desc'
	});
});

test('the column already descending returns the list to its own order', () => {
	const current = { columnId: 'name', direction: 'desc' };

	assert.equal(nextListSort(current, 'name', sortable), null);
});

test('a column the query cannot order by leaves the sort alone', () => {
	const current = { columnId: 'name', direction: 'asc' };

	assert.equal(nextListSort(current, 'vacant', sortable), current);
	assert.equal(nextListSort(null, 'vacant', sortable), null);
});
