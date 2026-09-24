import assert from 'node:assert/strict';
import test from 'node:test';

import { TRPCError } from '@trpc/server';

import { AWAITING_BLOCKERS, isConfirmable, toConfirmation, toRefusal } from '../confirmation.ts';

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

test('a refusal written for the reader reaches them as the procedure wrote it', () => {
	assert.equal(
		toRefusal(
			new TRPCError({ code: 'BAD_REQUEST', message: '3 units belong to this complex' }),
			'something went wrong'
		),
		'3 units belong to this complex'
	);
});

test('anything that is not a refusal says nothing on the surface', () => {
	assert.equal(
		toRefusal(new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no such column' }), 'oops'),
		null
	);
	assert.equal(toRefusal(new Error('the database is gone'), 'oops'), null);
	assert.equal(toRefusal('not an error at all', 'oops'), null);
});

// an omitted message is filled in with the code by `TRPCError` itself, so the only refusal that
// reaches a surface with nothing to say is one whose message was set to empty deliberately.
test('a refusal carrying no message of its own falls back rather than showing an empty callout', () => {
	assert.equal(
		toRefusal(new TRPCError({ code: 'BAD_REQUEST', message: '' }), 'something went wrong'),
		'something went wrong'
	);
});

// effort 832: a refusal crosses as a code, and only the consumer holds the sentence for it, so the
// consumer's reader is what words it. The package still decides which failures are refusals.
test("a refusal is worded by the consumer's reader, where one is given", () => {
	const refusal = new TRPCError({ code: 'BAD_REQUEST', message: 'refused: unit.gone' });

	assert.equal(
		toRefusal(refusal, 'oops', () => 'لم تعد هذه الوحدة موجودة'),
		'لم تعد هذه الوحدة موجودة'
	);
	assert.equal(
		toRefusal(refusal, 'oops', () => ''),
		'oops'
	);
	assert.equal(
		toRefusal(new Error('the database is gone'), 'oops', () => 'never read'),
		null
	);
});
