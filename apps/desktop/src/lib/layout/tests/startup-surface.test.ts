import assert from 'node:assert/strict';
import test from 'node:test';

import { startupSurfaceBeforeLocale } from '$lib/layout/startup-surface.ts';
import { isolateDirection, toErrorText } from '$lib/error/message.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { harness } from './testing.ts';

loadLocale('en');

/**
 * A STARTUP THAT STOPS BEFORE IT CAN BE READ
 *
 * The first stage of startup reads the shell's settings and loads the reader's own locale, and
 * the gate every screen sits behind opens only after both. Either can throw, and a failure before
 * that line used to show an empty window that had been deliberately made visible.
 *
 * Two halves, and both are here because the second is what the first was missing: the unit reaches
 * `error` without a locale, and the window has something to draw when it does.
 */

// --- The two calls that can throw before a dictionary exists --------------------------

test('a settings file that will not parse stops the startup, with no locale loaded', async () => {
	const { startup, journal } = harness({
		settings: async () => {
			throw new Error('settings.json is not valid json');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.isI18nReady, false, 'nothing was loaded to read the failure in');
	assert.deepEqual(journal.localesLoaded, [], 'the throw is before the first load');
	// shown deliberately: there is a failure to report, and reporting it into a hidden window
	// would be no report at all.
	assert.equal(journal.shown, 1);
	assert.deepEqual(journal.failures, ['settings.json is not valid json']);
});

test('and a locale chunk that will not load stops it in the same place', async () => {
	const { startup, journal } = harness({
		loadLocale: async () => {
			throw new Error('failed to fetch dynamically imported module');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.isI18nReady, false);
	// it was asked for and did not arrive, which is the difference from the case above.
	assert.deepEqual(journal.localesLoaded, ['en']);
	assert.equal(journal.shown, 1);
});

test('and whatever the failure path made of it is what reaches the screen', async () => {
	// the port itself is the route's and is covered below; what this pins is that the unit carries
	// the described failure through rather than dropping it.
	const { startup } = harness({
		settings: async () => {
			throw new Error('the host refused the call');
		}
	});

	await startup.start();

	assert.equal(startup.snapshot.error, 'the host refused the call');
});

test('and a failure the reader cannot be told about in words still reads as one', () => {
	// what the real port does, which the harness's own stand-in cannot show. A failure that crossed
	// the Tauri boundary is titled from its code, and the code's title is a translation: with no
	// locale it is the empty string, and the detail is all that is left. A separator in front of
	// that detail would read as a sentence whose first half went missing.
	// `ar` is never loaded in this file, so what comes back is the same object the application
	// holds before its first locale arrives: every string resolves to the empty one.
	const unloaded = i18nObject('ar');

	assert.equal(unloaded.common.errors.io(), '', 'the stand-in is the real thing, not a mock');

	const text = toErrorText({ code: 'io', message: 'failed to read settings.json' }, unloaded);

	// isolated the way every untranslated detail is, and nothing in front of it.
	assert.equal(text, isolateDirection('failed to read settings.json'));
	assert.doesNotMatch(text, /^\s|—/);
});

// --- What the window draws while nothing can be read ----------------------------------

test('a startup that stopped before a locale is drawn rather than left blank', async () => {
	const { startup } = harness({
		settings: async () => {
			throw new Error('settings.json is not valid json');
		}
	});

	await startup.start();

	assert.equal(startupSurfaceBeforeLocale(startup.snapshot), 'failure');
});

test('a locale chunk that will not load draws it too', async () => {
	const { startup } = harness({
		loadLocale: async () => {
			throw new Error('failed to fetch dynamically imported module');
		}
	});

	await startup.start();

	assert.equal(startupSurfaceBeforeLocale(startup.snapshot), 'failure');
});

test('and it stays drawn while the retry runs, rather than handing back the blank window', async () => {
	// the one control this screen offers is the retry, and `start` sets `loading` and clears the
	// error on its first line. A screen that went away there would put the reader back where they
	// pressed their way out of.
	let failing = true;
	const { startup } = harness({
		settings: async () => {
			if (failing) {
				throw new Error('settings.json is not valid json');
			}

			return { locale: 'en' };
		}
	});

	await startup.start();
	assert.equal(startupSurfaceBeforeLocale(startup.snapshot), 'failure');

	// mid-retry: loading, no error, and still nothing that can be read.
	const midRetry = { ...startup.snapshot, state: 'loading' as const, error: null };
	assert.equal(startupSurfaceBeforeLocale(midRetry), 'failure');

	failing = false;
	await startup.retry();

	// and once a locale arrives it has nothing left to be true about.
	assert.equal(startup.snapshot.isI18nReady, true);
	assert.equal(startup.snapshot.hasFailedUnreadable, false);
	assert.equal(startupSurfaceBeforeLocale(startup.snapshot), 'nothing');
});

test('and a startup still on its way to one draws nothing, which is not a state to be stuck in', async () => {
	const { startup } = harness();

	assert.equal(startup.snapshot.isI18nReady, false);
	assert.equal(startup.snapshot.state, 'loading');
	assert.equal(startupSurfaceBeforeLocale(startup.snapshot), 'nothing');
});

test('and once a locale is loaded this side of the gate has nothing to say', async () => {
	const { startup } = harness();

	await startup.start();

	assert.equal(startup.snapshot.isI18nReady, true);
	// a failure after the gate opened is the ordinary failure screen's, which can be read.
	assert.equal(startupSurfaceBeforeLocale({ ...startup.snapshot, state: 'error' }), 'nothing');
});

// --- The two words this screen cannot look up -----------------------------------------

test('the pre-locale screen names its controls with the base locale own words', () => {
	// the screen writes them in rather than reading them, because reading is the thing that failed.
	// This is what stops the two copies drifting: the same control has one English name whichever
	// failure screen a reader reaches.
	const en = i18nObject('en');

	assert.equal(en.settings.diagnosticsReveal(), 'open log folder');
	assert.equal(en.common.actions.retryStartup(), 'retry startup');
});
