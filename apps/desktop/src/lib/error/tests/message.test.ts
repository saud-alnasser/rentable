import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { toErrorDetail, toErrorMessage, toErrorText } from '$lib/error/message.ts';
import { TAURI_ERROR_CODES, TAURI_REFUSAL_REASONS } from '$lib/error/tauri.ts';
import { TRPCError } from '@trpc/server';

// the loaded locale rather than a hand-written stand-in: these functions take the whole of
// `TranslationFunctions`, and the two-key object this used to pass was a shape nothing ever
// hands them. The titles below are therefore the words english actually says.
loadLocale('en');

const translations = i18nObject('en');

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
		title: 'the data does not match what was expected.',
		detail: 'hash mismatch'
	});
});

test('a router failure is titled from its code, and its English message is neither title nor detail', () => {
	const failure = new TRPCError({
		code: 'FORBIDDEN',
		message: 'this account does not hold createPayment in this workspace'
	});

	assert.deepEqual(toErrorMessage(failure, translations), {
		title: 'your role does not allow this in this workspace.',
		detail: null
	});
	assert.equal(
		toErrorText(
			new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no such table' }),
			translations
		),
		'unexpected error occurred!'
	);
	// the message is still there for whoever reads diagnostics or opens a disclosure.
	assert.equal(toErrorDetail(failure), failure.message);
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
		'the data does not match what was expected. — ⁨hash mismatch⁩'
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
			title: 'a file could not be read or written.',
			detail: null
		}
	);
});

/**
 * Effort 832, requirement 23: **a refusal the shell raises reads as its reason's sentence, in the
 * reader's language, and nothing of Rust's English rides with it.** Every one-line surface that
 * shows a failure goes through `toErrorText` (autosync, the members' edits, the settings area, the
 * startup ports), so this is what each of them renders.
 */
test('a shell refusal reads as its reason in the reader’s language, with no rust prose beside it', () => {
	loadLocale('ar');

	const refused = {
		code: 'refused',
		reason: 'roleLacksAct',
		message: 'your role does not include inviteMember'
	};

	assert.equal(toErrorText(refused, translations), en.common.refusals.host.roleLacksAct);
	assert.equal(toErrorText(refused, i18nObject('ar')), ar.common.refusals.host.roleLacksAct);
	assert.deepEqual(toErrorMessage(refused, i18nObject('ar')), {
		title: ar.common.refusals.host.roleLacksAct,
		detail: null
	});

	// and the same after a procedure wrapped it, which is how a host call made through the router
	// reaches the caller.
	const wrapped = Object.assign(new Error('wrapped'), { cause: refused });

	assert.equal(toErrorText(wrapped, i18nObject('ar')), ar.common.refusals.host.roleLacksAct);
});

test('every reason the shell can refuse with has a sentence in both locales, and they differ', () => {
	for (const reason of TAURI_REFUSAL_REASONS) {
		const english = en.common.refusals.host[reason];
		const arabic = ar.common.refusals.host[reason];

		assert.ok(english.length > 0, `english is missing ${reason}`);
		assert.ok(arabic.length > 0, `arabic is missing ${reason}`);
		assert.notEqual(arabic, english, `arabic copies english for ${reason}`);
	}

	assert.deepEqual(Object.keys(en.common.refusals.host).sort(), [...TAURI_REFUSAL_REASONS].sort());
	assert.deepEqual(Object.keys(ar.common.refusals.host).sort(), [...TAURI_REFUSAL_REASONS].sort());
});

// a failure nobody can act on is not a refusal, and keeps its generic sentence with the prose as
// detail (the ticket's constraint).
test('an io failure stays the generic sentence', () => {
	assert.deepEqual(toErrorMessage({ code: 'io', message: 'permission denied' }, translations), {
		title: en.common.errors.io,
		detail: 'permission denied'
	});
});

// a reason this side has no word for is not shown as rust's prose either.
test('a refusal carrying a reason this side does not know falls back to the refused sentence', () => {
	assert.equal(
		toErrorMessage({ code: 'refused', reason: 'burnt', message: 'x' }, translations).title,
		en.common.errors.refused
	);
});
