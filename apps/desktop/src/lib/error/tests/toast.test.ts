import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

// svelte-sonner reaches a `.svelte` file, which this harness cannot load. the
// substitute is also the assertion: what the toast was asked to render.
type RaisedToast = { title: string; options: { description: string | undefined } };

const raised: RaisedToast[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			error: (title: string, options: { description: string | undefined }) => {
				raised.push({ title, options });
			}
		}
	}
});

const { showErrorToast } = await import('$lib/error/toast');

// the loaded locale rather than a hand-written stand-in: `showErrorToast` takes the whole of
// `TranslationFunctions`, and the two-key object this used to pass was a shape nothing ever
// hands it. The titles below are therefore the words english actually says.
loadLocale('en');

const translations = i18nObject('en');

test('a failure that crossed the tauri boundary is titled from its code and keeps its prose', () => {
	raised.length = 0;

	showErrorToast({ code: 'notConfigured', message: 'the drive said no' }, translations);

	assert.deepEqual(raised, [
		{
			title: 'this feature is not set up yet.',
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
