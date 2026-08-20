import assert from 'node:assert/strict';
import test from 'node:test';

import { selectedRecords } from '$lib/design/selection.ts';

/** the shape every list's records share, which is the whole of what this rule reads. */
type Row = { id: string; name: string };

const shown: Row[] = [
	{ id: 'a', name: 'Abby' },
	{ id: 'b', name: 'Basim' },
	{ id: 'c', name: 'Carla' }
];

// --- Which records a selection names --------------------------------------------------

test('the selected records come back in the order the list is showing them', () => {
	// picked bottom to top, which is what a reader working up a list does.
	assert.deepEqual(
		selectedRecords(shown, ['c', 'a']).map((record) => record.id),
		['a', 'c']
	);
});

test('and a record the list is no longer showing is not among them', () => {
	// the id survives a refetch that removed the row; a file of records that no longer exist is
	// not what the reader asked for.
	assert.deepEqual(
		selectedRecords(shown, ['a', 'gone']).map((record) => record.id),
		['a']
	);
});

test('and an empty selection names nothing rather than everything', () => {
	assert.deepEqual(selectedRecords(shown, []), []);
});

test('and an id named twice is one record', () => {
	assert.deepEqual(
		selectedRecords(shown, ['b', 'b']).map((record) => record.id),
		['b']
	);
});

test('the whole list selected is the whole list, unreordered', () => {
	assert.deepEqual(selectedRecords(shown, ['b', 'c', 'a']), shown);
});

test('the records themselves come back, not their ids', () => {
	assert.deepEqual(selectedRecords(shown, ['b']), [{ id: 'b', name: 'Basim' }]);
});
