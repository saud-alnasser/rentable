import assert from 'node:assert/strict';
import test from 'node:test';

import { AWAITING_BLOCKERS, isConfirmable, toConfirmation } from '../confirmation.ts';

test('a caller with nothing to read gets the confirmation offered', () => {
	assert.equal(toConfirmation(undefined).state, 'offered');
});

test('an empty list says the same thing as saying nothing', () => {
	assert.equal(toConfirmation([]).state, 'offered');
});

test('a caller still reading withholds the confirmation without refusing it', () => {
	assert.equal(toConfirmation(AWAITING_BLOCKERS).state, 'awaiting');
});

test('anything blocking the operation refuses it rather than offering a failure', () => {
	assert.equal(toConfirmation(['3 units belong to this complex']).state, 'blocked');
});

test('only a blocked confirmation names anything', () => {
	assert.deepEqual(toConfirmation(['2 contracts hold this unit']).blocking, [
		'2 contracts hold this unit'
	]);
	assert.deepEqual(toConfirmation(undefined).blocking, []);
	assert.deepEqual(toConfirmation(AWAITING_BLOCKERS).blocking, []);
});

test('the control is pressable exactly while the operation is offered and idle', () => {
	assert.equal(isConfirmable('offered', false), true);
	assert.equal(isConfirmable('offered', true), false);
	assert.equal(isConfirmable('awaiting', false), false);
	assert.equal(isConfirmable('blocked', false), false);
});
