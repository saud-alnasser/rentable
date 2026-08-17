import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TAURI_ERROR_CODES, isTauriError, toTauriErrorCode } from '$lib/error/tauri';

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
