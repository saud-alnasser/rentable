import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refuse, readRefusal } from '$lib/api/refusal.ts';
import { appRouter } from '$lib/api/router.ts';
import { toErrorMessage } from '$lib/error/message.ts';
import { fieldOfRefusal, toRefusalText } from '$lib/error/refusal.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadAllLocales } from '$lib/i18n/i18n-util.sync.ts';
import { TRPCError } from '@trpc/server';
import { getErrorShape } from '@trpc/server/unstable-core-do-not-import';

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

test('a BAD_REQUEST carrying no refusal is shown as it was raised, and anything else as unexpected', () => {
	const schema = new TRPCError({ code: 'BAD_REQUEST', message: 'name at least one unit.' });

	assert.equal(toRefusalText(schema, en), 'name at least one unit.');
	assert.equal(
		toRefusalText(new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no such table' }), ar),
		ar.common.messages.unexpectedError()
	);
	assert.equal(toRefusalText(new Error('boom'), ar), ar.common.messages.unexpectedError());
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
