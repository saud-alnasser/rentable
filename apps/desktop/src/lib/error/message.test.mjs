import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { toErrorDetail, toErrorMessage, toErrorText } from '$lib/error/message';
import { TAURI_ERROR_CODES } from '$lib/error/tauri';

const translations = {
	common: {
		errors: Object.fromEntries(TAURI_ERROR_CODES.map((code) => [code, () => `translated ${code}`])),
		messages: { unexpectedError: () => 'unexpected error occurred!' }
	}
};

test('every code the rust surface can send has an english and an arabic message', () => {
	for (const code of TAURI_ERROR_CODES) {
		assert.equal(typeof en.common.errors[code], 'string', `english is missing ${code}`);
		assert.equal(typeof ar.common.errors[code], 'string', `arabic is missing ${code}`);
	}
});

test('neither locale carries a message for a code that no longer exists', () => {
	assert.deepEqual(Object.keys(en.common.errors).sort(), [...TAURI_ERROR_CODES].sort());
	assert.deepEqual(Object.keys(ar.common.errors).sort(), [...TAURI_ERROR_CODES].sort());
});

test('the prose is read off whatever shape the value arrived in', () => {
	assert.equal(toErrorDetail(new Error('hash mismatch')), 'hash mismatch');
	assert.equal(toErrorDetail('hash mismatch'), 'hash mismatch');
	assert.equal(toErrorDetail({ code: 'integrity', message: 'hash mismatch' }), 'hash mismatch');
});

test('a value carrying no readable prose has no detail', () => {
	for (const value of [null, undefined, '   ', {}, { message: '  ' }]) {
		assert.equal(toErrorDetail(value), null, `read prose out of ${JSON.stringify(value)}`);
	}
});

test('a command failure is titled from its code and keeps the rust prose as detail', () => {
	assert.deepEqual(toErrorMessage({ code: 'integrity', message: 'hash mismatch' }, translations), {
		title: 'translated integrity',
		detail: 'hash mismatch'
	});
});

test('an error raised inside typescript is shown as it was written', () => {
	assert.deepEqual(toErrorMessage(new Error('a sync is already running'), translations), {
		title: 'a sync is already running',
		detail: null
	});
});

test('a value carrying nothing readable falls back to the unexpected-error message', () => {
	assert.deepEqual(toErrorMessage(undefined, translations), {
		title: 'unexpected error occurred!',
		detail: null
	});
});

test('flattening joins the title and the detail, isolating the untranslated prose', () => {
	assert.equal(
		toErrorText({ code: 'integrity', message: 'hash mismatch' }, translations),
		'translated integrity — ⁨hash mismatch⁩'
	);
});

test('flattening a detail-free failure yields the title alone', () => {
	assert.equal(
		toErrorText(new Error('a sync is already running'), translations),
		'a sync is already running'
	);
});

test('a caller fallback replaces the generic message when nothing is readable', () => {
	assert.deepEqual(toErrorMessage(undefined, translations, 'failed to start the app.'), {
		title: 'failed to start the app.',
		detail: null
	});
	assert.equal(
		toErrorText(undefined, translations, 'failed to start the app.'),
		'failed to start the app.'
	);
});

test('a caller fallback never displaces a code the failure actually carried', () => {
	assert.deepEqual(
		toErrorMessage({ code: 'io', message: '  ' }, translations, 'failed to start the app.'),
		{
			title: 'translated io',
			detail: null
		}
	);
});
