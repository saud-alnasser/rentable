import assert from 'node:assert/strict';
import test from 'node:test';

import { identityField } from '../tenant.ts';

const MESSAGE = 'not an identity number';
const field = identityField(MESSAGE);

const NATIONAL_ID = '1234567890';
const IQAMA = '2345678901';

// --- Accepted document forms ---------------------------------------------------------

test('a national id (prefix 1) is accepted unchanged', () => {
	assert.equal(field.parse(NATIONAL_ID), NATIONAL_ID);
});

test('an iqama (prefix 2) is accepted unchanged', () => {
	assert.equal(field.parse(IQAMA), IQAMA);
});

// --- Normalization -------------------------------------------------------------------

test('surrounding whitespace is removed before the value is tested', () => {
	assert.equal(field.parse(`  ${NATIONAL_ID}  `), NATIONAL_ID);
	assert.equal(field.parse(`\t${IQAMA}\n`), IQAMA);
});

// --- Refused forms -------------------------------------------------------------------

for (const value of [
	`!${NATIONAL_ID}!`,
	`hello ${NATIONAL_ID} world`,
	`abc${NATIONAL_ID}xyz`,
	`${NATIONAL_ID}0`,
	'3234567890',
	'12345'
]) {
	test(`${JSON.stringify(value)} is refused`, () => {
		const result = field.safeParse(value);

		assert.equal(result.success, false);
		assert.equal(result.error.issues[0].message, MESSAGE);
	});
}

// --- The message is the caller's -----------------------------------------------------

test('each caller supplies its own message, so the locale is not fixed here', () => {
	const arabic = identityField('رقم الهوية غير صالح');
	const result = arabic.safeParse('nope');

	assert.ok(result.error);
	assert.equal(result.error.issues[0].message, 'رقم الهوية غير صالح');
});
