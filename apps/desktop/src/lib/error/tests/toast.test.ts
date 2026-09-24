import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { TRPCError } from '@trpc/server';

// svelte-sonner reaches a `.svelte` file, which this harness cannot load. the
// substitute is also the assertion: what the toast was asked to render, which is its title and
// whatever options came with it.
type RaisedToast = { title: string; options: unknown };

const raised: RaisedToast[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			error: (title: string, options?: unknown) => {
				raised.push({ title, options });
			}
		}
	}
});

// what the toast leaves in diagnostics, which is where the shell's own words go instead.
type Recorded = { event: string; fields: Record<string, unknown> };

const recorded: Recorded[] = [];

mock.module('$lib/platform/diagnostics', {
	exports: {
		recordDiagnosticError: (event: string, fields: Record<string, unknown>) => {
			recorded.push({ event, fields });
		}
	}
});

const { showErrorToast } = await import('$lib/error/toast');

// the loaded locale rather than a hand-written stand-in: `showErrorToast` takes the whole of
// `TranslationFunctions`, and the two-key object this used to pass was a shape nothing ever
// hands it. The titles below are therefore the words each locale actually says.
loadLocale('en');
loadLocale('ar');

const translations = i18nObject('en');
const ar = i18nObject('ar');

const reset = () => {
	raised.length = 0;
	recorded.length = 0;
};

test('a failure that crossed the tauri boundary is titled from its code, and its prose is not shown', () => {
	reset();

	showErrorToast({ code: 'notConfigured', message: 'the drive said no' }, translations);

	assert.deepEqual(raised, [{ title: 'this feature is not set up yet.', options: undefined }]);
	assert.deepEqual(recorded, [
		{ event: 'toast.failed', fields: { code: 'notConfigured', detail: 'the drive said no' } }
	]);
});

/**
 * THE SHELL'S OWN WORDS STAY BEHIND DETAILS
 *
 * A failure nobody can act on, an I/O failure or a corrupt file, is not a refusal and keeps its
 * generic sentence. What the shell said is English whatever the reader's language, and a toast
 * has no room for a disclosure to open in, so it goes to diagnostics and never becomes visible
 * text (effort 832, requirement 23).
 */
test('an io failure in arabic toasts the arabic sentence, and the english message is nowhere in it', () => {
	const english = 'failed to read settings.json: permission denied';

	for (const failure of [
		{ code: 'io', message: english },
		// the same failure after the router wrapped it, which is how most of them arrive.
		new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: english,
			cause: { code: 'io', message: english }
		})
	]) {
		reset();

		showErrorToast(failure, ar);

		assert.deepEqual(raised, [{ title: ar.common.errors.io(), options: undefined }]);
		assert.doesNotMatch(JSON.stringify(raised), /permission denied/);
		assert.equal(recorded[0]?.fields.detail, english, 'kept for whoever is asked about it');
	}
});

test('a failure with nothing behind the sentence carries no description and records nothing', () => {
	reset();

	showErrorToast(new Error('already linked'), translations);

	assert.deepEqual(raised, [{ title: 'already linked', options: undefined }]);
	assert.deepEqual(recorded, []);
});

test('a value carrying no readable prose falls back to the generic sentence', () => {
	reset();

	showErrorToast({}, translations);

	assert.deepEqual(raised, [{ title: 'unexpected error occurred!', options: undefined }]);
});
