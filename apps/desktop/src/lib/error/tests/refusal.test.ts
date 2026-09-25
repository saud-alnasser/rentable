import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refuse, readRefusal } from '$lib/api/refusal.ts';
import { appRouter } from '$lib/api/router.ts';
import { toErrorMessage } from '$lib/error/message.ts';
import { fieldOfFailure, fieldOfRefusal, toRefusalText } from '$lib/error/refusal.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadAllLocales } from '$lib/i18n/i18n-util.sync.ts';
import { TRPCError } from '@trpc/server';
import { getErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

// effort 832, requirement 23: a refusal crosses as a code and its values, and this is where the
// interface turns one into the reader's words and a form learns where to put them.

loadAllLocales();

const en = i18nObject('en');
const ar = i18nObject('ar');

test('a refusal carries its code and values on the cause, and its message is for a developer', () => {
	const error = refuse('unit.nameRepeated', { name: 'A1' });

	assert.equal(error.code, 'BAD_REQUEST');
	assert.deepEqual(readRefusal(error), { code: 'unit.nameRepeated', params: { name: 'A1' } });
	assert.equal(error.message, 'refused: unit.nameRepeated {"name":"A1"}');
});

test('the error formatter copies the refusal into the shape a transport sends', () => {
	const error = refuse('contract.endBeforeStart');
	const shape = getErrorShape({
		config: appRouter._def._config,
		error,
		type: 'mutation',
		path: 'contract.create',
		input: undefined,
		ctx: undefined
	});

	assert.deepEqual((shape.data as { refusal?: unknown }).refusal, {
		code: 'contract.endBeforeStart',
		params: {}
	});
	// and the shape reads back as the same refusal, which is what a client across a link reads.
	assert.deepEqual(readRefusal(shape), readRefusal(error));
});

test('a refusal reads in the reader language, never as the message it was raised with', () => {
	const error = refuse('contract.endBeforeStart');

	assert.equal(toRefusalText(error, en), 'end date must be after start date.');
	assert.equal(toRefusalText(error, ar), 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.');
});

test('a value a refusal names is isolated, so an Arabic sentence cannot reorder it', () => {
	const text = toRefusalText(refuse('tenant.phoneTakenNamed', { named: '+966551234567' }), ar);

	assert.equal(text, 'رقم الهاتف ⁨+966551234567⁩ مرتبط بمستأجر مسجل.');
});

// effort 832, requirement 23: a failure a router raises that is not a refusal still reads in the
// reader's language, and the English it was raised with, a developer's description, never shows.

/** the input a procedure's schema turned away, raised the way tRPC raises it. */
function inputRejection(input: unknown) {
	const parsed = z
		.object({ amount: z.number().positive(), note: z.string().optional() })
		.safeParse(input);

	return new TRPCError({ code: 'BAD_REQUEST', cause: parsed.error });
}

const ROUTER_FAILURES = [
	[
		new TRPCError({
			code: 'FORBIDDEN',
			message: 'this account does not hold createPayment in this workspace'
		}),
		'دورك لا يسمح بهذا في مساحة العمل هذه.'
	],
	[
		new TRPCError({ code: 'UNAUTHORIZED', message: 'no account is signed in on this machine' }),
		'سجّل الدخول للقيام بهذا.'
	],
	[
		new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no such table: payments' }),
		'حدث خطأ غير متوقع!'
	],
	[inputRejection({ amount: -1 }), 'بعض ما أُدخل غير صالح. راجعه وحاول مرة أخرى.'],
	[
		new TRPCError({ code: 'BAD_REQUEST', message: 'name at least one unit.' }),
		'بعض ما أُدخل غير صالح. راجعه وحاول مرة أخرى.'
	]
] as const;

test('every failure a router raises reads in Arabic, with none of its message visible', () => {
	for (const [error, sentence] of ROUTER_FAILURES) {
		const text = toRefusalText(error, ar);

		assert.equal(text, sentence, error.code);
		assert.doesNotMatch(text, /[a-z]/i, `English reached the reader for ${error.code}`);
		assert.ok(!text.includes(error.message), `the message of ${error.code} reached the reader`);
	}

	assert.equal(toRefusalText(new Error('boom'), ar), ar.common.messages.unexpectedError());
});

test('a toast titles a router failure in Arabic and carries no English detail', () => {
	for (const [error, sentence] of ROUTER_FAILURES) {
		assert.deepEqual(toErrorMessage(error, ar), { title: sentence, detail: null }, error.code);
	}
});

test('an input the schema turned away is placed under the field its path names', () => {
	assert.equal(fieldOfFailure(inputRejection({ amount: -1 })), 'amount');
	// a path naming no field a form places, and a rejection with no path, belong to no field.
	assert.equal(fieldOfFailure(inputRejection({ amount: 1, note: 4 })), null);
	assert.equal(fieldOfFailure(new TRPCError({ code: 'BAD_REQUEST', message: 'x' })), null);
	// a refusal is still placed by its code, and a failure that is not a rejection by nothing.
	assert.equal(fieldOfFailure(refuse('contract.govIdTaken')), 'govId');
	assert.equal(fieldOfFailure(new TRPCError({ code: 'FORBIDDEN' })), null);
});

test('a toast titles a refusal from its code and carries no English detail', () => {
	assert.deepEqual(toErrorMessage(refuse('payment.datedInFuture'), ar), {
		title: 'لا يمكن أن يكون تاريخ الدفعة في المستقبل.',
		detail: null
	});
});

test('a form finds a refusal field by its code', () => {
	assert.equal(fieldOfRefusal('contract.govIdTaken'), 'govId');
	assert.equal(fieldOfRefusal('contract.govIdTakenNamed'), 'govId');
	assert.equal(fieldOfRefusal('contract.renewalBeforeEnd'), 'start');
	assert.equal(fieldOfRefusal('contract.unitsUnavailable'), 'end');
	assert.equal(fieldOfRefusal('contract.unitsTaken'), 'unitIds');
	assert.equal(fieldOfRefusal('tenant.phoneTaken'), 'phoneNumber');
	assert.equal(fieldOfRefusal('unit.nameRepeated'), 'units');
	assert.equal(fieldOfRefusal('payment.amountNotPositive'), 'amount');
});

test('a refusal that belongs to no field, and no refusal at all, have none', () => {
	assert.equal(fieldOfRefusal('contract.holdsPayments'), null);
	assert.equal(fieldOfRefusal(null), null);
	assert.equal(fieldOfRefusal(undefined), null);
});
