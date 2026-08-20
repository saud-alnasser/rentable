import assert from 'node:assert/strict';
import test from 'node:test';

import { firstTakenName, parseUnitRun, UNIT_RUN_LIMIT } from '$lib/complex/unit-name.ts';

// --- The run notation ----------------------------------------------------------------

test('a run names every unit from the first number to the last', () => {
	assert.deepEqual(parseUnitRun('A1-4'), { names: ['A1', 'A2', 'A3', 'A4'] });
});

// the prefix is what was typed, not what a formatter would have typed. `A 1-18` names `A 1`
// because the reader put the space there, and `A1-18` names `A1` because they did not.
test('a run keeps the prefix exactly as it was written', () => {
	assert.deepEqual(parseUnitRun('A 1-3').names, ['A 1', 'A 2', 'A 3']);
	assert.deepEqual(parseUnitRun('A1-3').names, ['A1', 'A2', 'A3']);
});

test('a run of one number names one unit', () => {
	assert.deepEqual(parseUnitRun('B7-7'), { names: ['B7'] });
});

// the numbers are read as numbers, so the prefix ends where the first of them begins.
test('a run with no prefix names the numbers themselves', () => {
	assert.deepEqual(parseUnitRun('1-3').names, ['1', '2', '3']);
});

test('a line that is not a run names one unit called what it says', () => {
	assert.deepEqual(parseUnitRun('penthouse'), { names: ['penthouse'] });
});

// a name holding a dash between two numbers is a run, and a name holding one anywhere else is
// a name: the pair has to be at the end for the line to be read as a run at all.
test('a line whose numbers are not at the end is one name', () => {
	assert.deepEqual(parseUnitRun('A1-2 west'), { names: ['A1-2 west'] });
});

test('an empty line names nothing, and is not a refusal', () => {
	assert.deepEqual(parseUnitRun('   '), { names: [] });
});

test('a run whose last number is below its first names nothing, and says why', () => {
	assert.deepEqual(parseUnitRun('A18-1'), { names: [], refusal: 'end-before-start' });
});

test('a run over the limit names nothing, and says why', () => {
	const over = parseUnitRun(`A1-${UNIT_RUN_LIMIT + 1}`);

	assert.deepEqual(over, { names: [], refusal: 'over-the-limit' });
});

// the limit is inclusive, and the boundary is the half of it worth pinning: a run of exactly
// the limit is one the reader is allowed to ask for.
test('a run of exactly the limit is allowed', () => {
	assert.equal(parseUnitRun(`A1-${UNIT_RUN_LIMIT}`).names.length, UNIT_RUN_LIMIT);
});

// --- The first name already taken ----------------------------------------------------

test('a name already held is named, rather than reported as a match', () => {
	assert.equal(firstTakenName(['A1', 'A2', 'A3'], ['A2']), 'A2');
});

test('the first collision is the one named, not the last', () => {
	assert.equal(firstTakenName(['A1', 'A2', 'A3'], ['A3', 'A2']), 'A2');
});

// the batch collides with itself as readily as it collides with the list it is joining, and a
// run expanded onto a list already holding half of it produces exactly that.
test('a name the batch repeats is a collision even where nothing holds it yet', () => {
	assert.equal(firstTakenName(['A1', 'A1'], []), 'A1');
});

test('the comparison is folded, and spacing does not make a second name', () => {
	assert.equal(firstTakenName(['a1'], ['A1']), 'a1');
	assert.equal(firstTakenName([' A1 '], ['A1']), ' A1 ');
});

test('a set colliding with nothing names nothing', () => {
	assert.equal(firstTakenName(['A1', 'A2'], ['B1']), undefined);
});
