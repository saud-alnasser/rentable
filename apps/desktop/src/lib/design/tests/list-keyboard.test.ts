import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { nextPosition, toListMovement, toListShortcuts, toRecordRows } from '../list-keyboard.ts';
import { toShortcutSheetEntries } from '../shortcut-registry.ts';

// the loaded locale rather than a hand-written stand-in: a description reads the whole of
// `TranslationFunctions`, and the three-key object this used to pass was a shape nothing ever
// hands it. English says the same words, so what is asserted is unchanged.
loadLocale('en');

const translations = i18nObject('en');

/** a list of plain records, laid out one to a row. */
function record(id: string) {
	return { id };
}

test('every row of a plain list holds one record', () => {
	assert.deepEqual(toRecordRows([{ kind: 'record', key: 'record:1', records: [record('1')] }]), [
		{ row: 0, count: 1 }
	]);
});

// a header is not somewhere focus can land, so it is dropped — but the rows keep the indices the
// virtualizer scrolls to, which is the whole reason a position carries a row rather than a count.
test('a group header is not a row focus can land on, and does not shift the ones that are', () => {
	const recordRows = toRecordRows([
		{ kind: 'header', key: 'group:1', group: { key: 'a' } },
		{ kind: 'record', key: 'record:1', records: [record('1')] },
		{ kind: 'header', key: 'group:2', group: { key: 'b' } },
		{ kind: 'record', key: 'record:2', records: [record('2')] }
	]);

	assert.deepEqual(recordRows, [
		{ row: 1, count: 1 },
		{ row: 3, count: 1 }
	]);
});

test('a row of a grid holds as many records as were laid out across it', () => {
	assert.deepEqual(
		toRecordRows([
			{ kind: 'record', key: 'record:1', records: [record('1'), record('2'), record('3')] }
		]),
		[{ row: 0, count: 3 }]
	);
});

test('an empty list has nowhere to move to', () => {
	assert.equal(nextPosition([], null, 'next'), null);
});

test('a first move forwards starts at the first record', () => {
	const recordRows = [
		{ row: 0, count: 1 },
		{ row: 1, count: 1 }
	];

	assert.deepEqual(nextPosition(recordRows, null, 'down'), { row: 0, column: 0 });
	assert.deepEqual(nextPosition(recordRows, null, 'next'), { row: 0, column: 0 });
});

// the symmetrical answer would be the last record, and it is the wrong one: there is no
// position to move back from, and a virtualized list is long enough that arriving at its end
// reads as having been thrown rather than having moved.
test('and so does a first move backwards, rather than arriving at the end of the list', () => {
	const recordRows = [
		{ row: 0, count: 1 },
		{ row: 1, count: 2 }
	];

	assert.deepEqual(nextPosition(recordRows, null, 'up'), { row: 0, column: 0 });
	assert.deepEqual(nextPosition(recordRows, null, 'previous'), { row: 0, column: 0 });
});

test('down and up move one row', () => {
	const recordRows = [
		{ row: 0, count: 1 },
		{ row: 1, count: 1 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 0 }, 'down'), { row: 1, column: 0 });
	assert.deepEqual(nextPosition(recordRows, { row: 1, column: 0 }, 'up'), { row: 0, column: 0 });
});

test('and keep their place across a grid rather than returning to its edge', () => {
	const recordRows = [
		{ row: 0, count: 3 },
		{ row: 1, count: 3 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 2 }, 'down'), { row: 1, column: 2 });
});

// the row a group cut short is the case: the reader is on the third column and the row below
// holds two records, so there is no third to arrive at.
test('a move into a shorter row lands on its last record', () => {
	const recordRows = [
		{ row: 0, count: 3 },
		{ row: 1, count: 2 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 2 }, 'down'), { row: 1, column: 1 });
});

test('next runs across a row before it moves down to the start of the following one', () => {
	const recordRows = [
		{ row: 0, count: 2 },
		{ row: 1, count: 2 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 0 }, 'next'), { row: 0, column: 1 });
	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 1 }, 'next'), { row: 1, column: 0 });
});

test('and previous runs back into the end of the row above', () => {
	const recordRows = [
		{ row: 0, count: 3 },
		{ row: 1, count: 2 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 1, column: 0 }, 'previous'), {
		row: 0,
		column: 2
	});
});

// nothing wraps: a list is virtualized and mostly longer than the window, so a move off one end
// reappearing at the other would land the reader somewhere they cannot see they arrived at.
test('a move off the end stays where it was rather than wrapping', () => {
	const recordRows = [
		{ row: 0, count: 2 },
		{ row: 1, count: 2 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 1, column: 1 }, 'next'), { row: 1, column: 1 });
	assert.deepEqual(nextPosition(recordRows, { row: 1, column: 1 }, 'down'), { row: 1, column: 1 });
	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 0 }, 'previous'), {
		row: 0,
		column: 0
	});
	assert.deepEqual(nextPosition(recordRows, { row: 0, column: 0 }, 'up'), { row: 0, column: 0 });
});

test('a narrower window that shortened the focused row brings the focus back onto it', () => {
	assert.deepEqual(nextPosition([{ row: 0, count: 2 }], { row: 0, column: 5 }, 'previous'), {
		row: 0,
		column: 0
	});
});

// a search narrows the list under whatever the keyboard was on, and the record it was on may not
// be in the result set at all.
test('a move from a row a search removed is an entry, not a move', () => {
	const recordRows = [
		{ row: 0, count: 1 },
		{ row: 1, count: 1 }
	];

	assert.deepEqual(nextPosition(recordRows, { row: 9, column: 0 }, 'down'), { row: 0, column: 0 });
	assert.deepEqual(nextPosition(recordRows, { row: 9, column: 0 }, 'up'), { row: 0, column: 0 });
});

// the criterion the suite cannot check on its own: `dir` reverses what "next" means, and the
// arrows are the only place in the application where that reversal is decided rather than drawn.
test('the sideways arrows swap with the reading direction', () => {
	assert.equal(toListMovement('ArrowRight', 'ltr'), 'next');
	assert.equal(toListMovement('ArrowLeft', 'ltr'), 'previous');
	assert.equal(toListMovement('ArrowRight', 'rtl'), 'previous');
	assert.equal(toListMovement('ArrowLeft', 'rtl'), 'next');
});

test('and the vertical pair does not, because a list still reads downwards in arabic', () => {
	assert.equal(toListMovement('ArrowDown', 'rtl'), 'down');
	assert.equal(toListMovement('ArrowUp', 'rtl'), 'up');
});

test('a key that is not an arrow is not a move, so it is left to whatever else wanted it', () => {
	assert.equal(toListMovement('Enter', 'ltr'), null);
	assert.equal(toListMovement('k', 'ltr'), null);
});

test('the search key puts the cursor in the field', () => {
	let focused = 0;

	const search = toListShortcuts(() => (focused += 1)).find(
		(registration) => registration.id === 'list.search'
	);

	assert.ok(search?.scope === 'application', 'the search key is the application’s to answer');
	search.run();

	assert.equal(focused, 1);
});

// the keys the list answers itself are the surface's: the application's listener would fire them
// on every screen, and a key meaning "the next record" means nothing away from the records.
test('the keys pressed inside the list are the surface it belongs to', () => {
	const scopes = Object.fromEntries(
		toListShortcuts(() => {}).map((registration) => [registration.id, registration.scope])
	);

	assert.deepEqual(scopes, {
		'list.search': 'application',
		'list.move': 'surface',
		'list.open': 'surface'
	});
});

test('the search key stands down where text is being typed, since it is a character', () => {
	const search = toListShortcuts(() => {}).find(
		(registration) => registration.id === 'list.search'
	);

	assert.ok(search?.scope === 'application', 'the search key is the application’s to answer');
	assert.equal(search.standsDownWhileEditing, true);
});

// every key this ticket adds reaches the sheet with no edit to the sheet, which is the whole
// claim the registry exists to make good on.
test('every key the list adds arrives on the help sheet, printed as the keyboard prints it', () => {
	assert.deepEqual(
		toShortcutSheetEntries(
			toListShortcuts(() => {}),
			translations,
			false
		),
		[
			{ id: 'list.search', description: 'search this list', hints: ['/'] },
			{ id: 'list.open', description: 'open the focused record', hints: ['Enter'] },
			{ id: 'list.move', description: 'move between records', hints: ['↑', '↓', '←', '→'] }
		]
	);
});
