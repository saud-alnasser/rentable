import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

// svelte-sonner reaches a `.svelte` file, which this harness cannot load. the substitute is also
// the assertion: what the toast was asked to render. Same shape as `error/tests/toast.test.ts`,
// which is where this pattern is from.
type RaisedToast = { tone: 'success' | 'error'; title: string; description: string | undefined };

const raised: RaisedToast[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (title: string, options: { description: string | undefined }) => {
				raised.push({ tone: 'success', title, description: options.description });
			},
			error: (title: string, options: { description: string | undefined }) => {
				raised.push({ tone: 'error', title, description: options.description });
			}
		}
	}
});

const { announceUpdateOutcome, describeUpdateOutcome } =
	await import('$lib/settings/update-announcement');

// the loaded locales rather than hand-written stand-ins: both functions take the whole of
// `TranslationFunctions`, and a partial of it is a shape nothing ever hands them.
loadLocale('en');
loadLocale('ar');

const en = i18nObject('en');
const ar = i18nObject('ar');

/**
 * WHAT THE UPDATES SECTION SAYS
 *
 * The section this replaces answered a check by growing a callout that stayed on screen until the
 * reader left the page. What replaced it announces and leaves the section alone, so the three
 * outcomes below are the whole of what a press can produce, and the fourth is the one that
 * deliberately produces nothing.
 */

test('a check that found nothing says so, because nothing on the section changed to say it', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'checked', hasRelease: false }, en);

	assert.deepEqual(raised, [
		{ tone: 'success', title: "you're already on the latest release.", description: undefined }
	]);
});

test('and it is the reader own language that says it', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'checked', hasRelease: false }, ar);

	assert.deepEqual(raised, [
		{ tone: 'success', title: 'أنت تستخدم أحدث إصدار.', description: undefined }
	]);
});

test('a check that failed is titled from its code and keeps rust own prose', () => {
	raised.length = 0;

	// what a failure crossing the tauri boundary looks like by the time it reaches here.
	announceUpdateOutcome(
		{ kind: 'failed', error: { code: 'network', message: 'error sending request for url' } },
		en
	);

	assert.deepEqual(raised, [
		{
			tone: 'error',
			title: en.common.errors.network(),
			description: 'error sending request for url'
		}
	]);
});

test('and a failure that never crossed it is shown as it was written', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'failed', error: new Error('the updater is not configured') }, en);

	assert.deepEqual(raised, [
		{ tone: 'error', title: 'the updater is not configured', description: undefined }
	]);
});

test('an install that finished says what is left to do about it', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'installed' }, en);

	assert.deepEqual(raised, [
		{ tone: 'success', title: en.settings.restartNotice(), description: undefined }
	]);
});

test('a check that found a release announces nothing, because the section itself answers it', () => {
	// the available-version plate fills in, the release panel appears and a download glyph joins
	// the check. A toast on top of that is the same news twice, and it is the one outcome this
	// section is allowed to answer by itself.
	raised.length = 0;

	assert.equal(describeUpdateOutcome({ kind: 'checked', hasRelease: true }, en), null);

	announceUpdateOutcome({ kind: 'checked', hasRelease: true }, en);

	assert.deepEqual(raised, []);
});
