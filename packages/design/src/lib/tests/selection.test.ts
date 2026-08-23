import assert from 'node:assert/strict';
import test from 'node:test';

import { describeRefusals, selectedRecords } from '#lib/selection.ts';

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

// --- How a refusal reads --------------------------------------------------------------

/** one concept's sentences, in the shape every surface declares them in. */
const labels = {
	'holds-units': (count: number) => `${count} still hold units`,
	missing: (count: number) => `${count} are no longer there`
};

test('a reason reads as the sentence its concept declared for it', () => {
	assert.equal(describeRefusals(labels)('holds-units', 3), '3 still hold units');
});

test('and the count reaches the sentence rather than being counted twice', () => {
	const describe = describeRefusals(labels);

	assert.equal(describe('holds-units', 1), '1 still hold units');
	assert.equal(describe('holds-units', 12), '12 still hold units');
});

test('a reason the surface has never heard of reads as a record it cannot account for', () => {
	// the shared confirmation hands a reason back as a plain string, so nothing in the types
	// stops one arriving that this concept never declared. It is not shown under another
	// reason's words, and it does not read as an empty sentence either.
	assert.equal(describeRefusals(labels)('holds-goats', 2), '2 are no longer there');
});

test('and `missing` itself still reads as its own sentence', () => {
	assert.equal(describeRefusals(labels)('missing', 2), '2 are no longer there');
});

test('and a reason named after something every object carries still falls back', () => {
	// a plain object answers `constructor` from its prototype, so a lookup that asked whether the
	// value was there would hand the confirmation a class where a sentence belongs.
	assert.equal(describeRefusals(labels)('constructor', 2), '2 are no longer there');
	assert.equal(describeRefusals(labels)('toString', 1), '1 are no longer there');
});
