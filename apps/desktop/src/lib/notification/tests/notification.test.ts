import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { TRPCError } from '@trpc/server';

// svelte-sonner reaches a `.svelte` file, which this harness cannot load. the
// substitute is also the assertion: what the toast was asked to render, which is its title and
// whatever options came with it.
type RaisedToast = { tone: 'error' | 'success' | 'warning'; title: string; options: unknown };

const raised: RaisedToast[] = [];

const raise = (tone: RaisedToast['tone']) => (title: string, options?: unknown) => {
	raised.push({ tone, title, options });

	return raised.length;
};

mock.module('svelte-sonner', {
	exports: {
		toast: { error: raise('error'), success: raise('success'), warning: raise('warning') }
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

const { notify, showErrorSentence, showErrorToast, showSuccessToast } =
	await import('$lib/notification');

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

// what every error toast is raised with: it stands until the reader closes it, and carries the
// control that closes it (effort 861, requirement 3).
const STANDS = { duration: Number.POSITIVE_INFINITY, closeButton: true };

test('a failure that crossed the tauri boundary is titled from its code, and its prose is not shown', () => {
	reset();

	showErrorToast({ code: 'notConfigured', message: 'the drive said no' }, translations);

	assert.deepEqual(raised, [
		{ tone: 'error', title: 'this feature is not set up yet.', options: STANDS }
	]);
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

		assert.deepEqual(raised, [{ tone: 'error', title: ar.common.errors.io(), options: STANDS }]);
		assert.doesNotMatch(JSON.stringify(raised), /permission denied/);
		assert.equal(recorded[0]?.fields.detail, english, 'kept for whoever is asked about it');
	}
});

test('a failure with nothing behind the sentence carries no description and records nothing', () => {
	reset();

	showErrorToast(new Error('already linked'), translations);

	assert.deepEqual(raised, [{ tone: 'error', title: 'already linked', options: STANDS }]);
	assert.deepEqual(recorded, []);
});

test('a value carrying no readable prose falls back to the generic sentence', () => {
	reset();

	showErrorToast({}, translations);

	assert.deepEqual(raised, [
		{ tone: 'error', title: 'unexpected error occurred!', options: STANDS }
	]);
});

/**
 * AN ERROR STANDS UNTIL IT IS CLOSED
 *
 * Requirement 3 of [[efforts/861-the-app-never-shows-something-false/spec]]: an error toast is
 * the only channel an act that failed has, and in the shared duration it was gone before it could
 * be read. Every error path reaches one of these two, the mutation handlers through `notify.error`
 * and everything else through `showErrorSentence`, so these two are where it is decided.
 */
test('an error raised through notify stands until it is closed, and carries the control', () => {
	reset();

	notify.error('the payment could not be saved.');

	assert.deepEqual(raised, [
		{ tone: 'error', title: 'the payment could not be saved.', options: STANDS }
	]);
});

test('an error sentence the surface already has stands until it is closed, too', () => {
	reset();

	showErrorSentence('this contract is already renewed.');

	assert.deepEqual(raised, [
		{ tone: 'error', title: 'this contract is already renewed.', options: STANDS }
	]);
});

// a success is read and gone in the shared duration, so it neither stands nor carries a close.
test('a success toast keeps the shared duration and carries no close control', () => {
	reset();

	notify.success('payment saved.');
	showSuccessToast('the file was written.', 'rentable.xlsx');

	assert.equal(raised.length, 2);

	for (const toast of raised) {
		assert.equal(toast.tone, 'success');

		const options = (toast.options ?? {}) as Record<string, unknown>;

		assert.equal(options.duration, undefined, toast.title);
		assert.equal(options.closeButton, undefined, toast.title);
	}
});
