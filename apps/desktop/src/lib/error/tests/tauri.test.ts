import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	TAURI_ERROR_CODES,
	TAURI_REFUSAL_REASONS,
	isTauriError,
	toTauriErrorCode,
	toTauriRefusalReason
} from '$lib/error/tauri';

test('a rejected command payload is recognised by its code and message', () => {
	assert.equal(isTauriError({ code: 'busy', message: 'a sync is already running' }), true);
});

test('every code the rust surface can send is recognised', () => {
	for (const code of TAURI_ERROR_CODES) {
		assert.equal(isTauriError({ code, message: 'x' }), true, `unrecognised code: ${code}`);
	}
});

test('a payload carrying an unknown code is not a tauri error', () => {
	assert.equal(isTauriError({ code: 'teapot', message: 'x' }), false);
});

test('a payload missing the message is not a tauri error', () => {
	assert.equal(isTauriError({ code: 'busy' }), false);
});

test('values that never crossed the boundary are not tauri errors', () => {
	for (const value of [null, undefined, 'busy', new Error('busy'), {}, []]) {
		assert.equal(isTauriError(value), false, `wrongly recognised: ${String(value)}`);
	}
});

test('the code is read off a rejected command payload', () => {
	assert.equal(toTauriErrorCode({ code: 'integrity', message: 'hash mismatch' }), 'integrity');
});

test('an error raised inside typescript has no code', () => {
	assert.equal(toTauriErrorCode(new Error('a sync is already running')), null);
});

// effort 828, requirement 1: a link refused on its own standing carries which standing beside its
// message, so the connect screen names it without reading the sentence. Four words and no more.
test('a refused link says which standing refused it', () => {
	for (const reason of TAURI_REFUSAL_REASONS) {
		assert.equal(
			toTauriRefusalReason({ code: 'refused', reason, message: 'the invitation has lapsed' }),
			reason
		);
	}
});

test('nothing but a refused carries a reason, and an unknown word is no reason at all', () => {
	assert.equal(toTauriRefusalReason({ code: 'forbidden', message: 'the code is wrong' }), null);
	assert.equal(toTauriRefusalReason({ code: 'refused', reason: 'burnt', message: 'x' }), null);
	assert.equal(toTauriRefusalReason({ code: 'refused', message: 'x' }), null);
	assert.equal(toTauriRefusalReason(new Error('the invitation has lapsed')), null);
});
