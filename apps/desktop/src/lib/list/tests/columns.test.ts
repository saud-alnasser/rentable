import assert from 'node:assert/strict';
import test from 'node:test';

import { columnsFor, RECORD_TILE_MIN_WIDTH } from '../list.ts';

/**
 * HOW MANY TILES FIT ACROSS
 *
 * Requirement 18 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: a grid
 * list is one column where the window is narrow, two where it is wider, and three where it is wide
 * enough, and never more. The gap between tiles is space a tile cannot have, so it is counted.
 */

const MIN = RECORD_TILE_MIN_WIDTH;
const GAP = 12;

test('a tile is three hundred pixels at its narrowest', () => {
	assert.equal(MIN, 300);
});

test('one column until two tiles and the gap between them fit', () => {
	assert.equal(columnsFor(0, MIN, GAP), 1);
	assert.equal(columnsFor(299, MIN, GAP), 1);
	assert.equal(columnsFor(611, MIN, GAP), 1);
});

test('two columns once two tiles and one gap fit, and until three tiles and two gaps do', () => {
	assert.equal(columnsFor(612, MIN, GAP), 2);
	assert.equal(columnsFor(923, MIN, GAP), 2);
});

test('three columns once three tiles and two gaps fit', () => {
	assert.equal(columnsFor(924, MIN, GAP), 3);
});

// a width holding exactly the tiles and nothing between them is the case a count that ignores the
// gap answers wrongly: it would draw two tiles narrower than the narrowest a tile may be.
test('the gap is counted, so tiles never come out narrower than their minimum', () => {
	assert.equal(columnsFor(600, MIN, GAP), 1);
	assert.equal(columnsFor(900, MIN, GAP), 2);
	assert.equal(columnsFor(600, MIN, 0), 2);
});

test('never four, however wide the window', () => {
	assert.equal(columnsFor(1236, MIN, GAP), 3);
	assert.equal(columnsFor(4000, MIN, GAP), 3);
});

test('a smaller cap is honoured', () => {
	assert.equal(columnsFor(4000, MIN, GAP, 2), 2);
});
