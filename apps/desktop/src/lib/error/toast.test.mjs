import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { TAURI_ERROR_CODES } from '$lib/error/tauri';

// svelte-sonner reaches a `.svelte` file, which this harness cannot load. the
// substitute is also the assertion: what the toast was asked to render.
const raised = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			error: (title, options) => raised.push({ title, options })
		}
	}
});

const { showErrorToast } = await import('$lib/error/toast');

const translations = {
	common: {
		errors: Object.fromEntries(TAURI_ERROR_CODES.map((code) => [code, () => `translated ${code}`])),
		messages: { unexpectedError: () => 'unexpected error occurred!' }
	}
};

test('a failure that crossed the tauri boundary is titled from its code and keeps its prose', () => {
	raised.length = 0;

	showErrorToast({ code: TAURI_ERROR_CODES[0], message: 'the drive said no' }, translations);

	assert.deepEqual(raised, [
		{
			title: `translated ${TAURI_ERROR_CODES[0]}`,
			options: { description: 'the drive said no' }
		}
	]);
});

test('a failure with nothing behind the sentence carries no description', () => {
	raised.length = 0;

	showErrorToast(new Error('already linked'), translations);

	assert.deepEqual(raised, [{ title: 'already linked', options: { description: undefined } }]);
});

test('a value carrying no readable prose falls back to the generic sentence', () => {
	raised.length = 0;

	showErrorToast({}, translations);

	assert.deepEqual(raised, [
		{ title: 'unexpected error occurred!', options: { description: undefined } }
	]);
});
