import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

// svelte-sonner reaches a `.svelte` file, which this harness cannot load. the substitute is also
// the assertion: what the toast was asked to render. Same shape as `notification/tests/notification.test.ts`,
// which is where this pattern is from.
type RaisedToast = { tone: 'success' | 'error'; title: string; description: string | undefined };

const raised: RaisedToast[] = [];

type Offer = { label: string; onClick: () => unknown };

const offers: { title: string; action: Offer | undefined; duration: number | undefined }[] = [];
const dismissed: unknown[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (
				title: string,
				options?: { description?: string; action?: Offer; duration?: number }
			) => {
				if (options?.action) {
					offers.push({ title, action: options.action, duration: options.duration });

					return offers.length;
				}

				raised.push({ tone: 'success', title, description: options?.description });

				return raised.length;
			},
			error: (title: string, options?: { description: string | undefined }) => {
				raised.push({ tone: 'error', title, description: options?.description });
			},
			dismiss: (id: unknown) => void dismissed.push(id)
		}
	}
});

const { announceUpdateOutcome, describeUpdate, describeUpdateOutcome, offerRestart } =
	await import('$lib/update/announcement');

// the loaded locales rather than hand-written stand-ins: both functions take the whole of
// `TranslationFunctions`, and a partial of it is a shape nothing ever hands them.
loadLocale('en');
loadLocale('ar');

const en = i18nObject('en');
const ar = i18nObject('ar');

/**
 * WHAT THE UPDATE SAYS
 *
 * The settings section answered a check by growing a callout that stayed on screen until the
 * reader left the page. What replaced it announces and leaves the card alone, so the outcomes
 * below are the whole of what a press on the card can produce, and the last is the one that
 * deliberately produces nothing. Since effort 857 (ticket 10) the same module says where the
 * update stands for the screen and the notice, and offers the restart into a downloaded release.
 */

test('a check that found nothing says so, because nothing on the section changed to say it', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'checked', hasRelease: false }, en);

	assert.deepEqual(raised, [
		{ tone: 'success', title: "you're on the latest version of rentable.", description: undefined }
	]);
});

test('and it is the reader own language that says it', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'checked', hasRelease: false }, ar);

	assert.deepEqual(raised, [
		{ tone: 'success', title: 'لديك أحدث إصدار من رينتابل.', description: undefined }
	]);
});

test('a check that could not reach the update server says so in the update own words', () => {
	raised.length = 0;

	// what a failure crossing the tauri boundary looks like by the time it reaches here.
	announceUpdateOutcome(
		{ kind: 'failed', error: { code: 'network', message: 'error sending request for url' } },
		en
	);

	assert.deepEqual(raised, [{ tone: 'error', title: en.update.offline(), description: undefined }]);
});

test('any other failure is titled from its code, and rust own prose is not the toast', () => {
	raised.length = 0;

	announceUpdateOutcome(
		{ kind: 'failed', error: { code: 'integrity', message: 'signature mismatch' } },
		en
	);

	assert.deepEqual(raised, [
		{ tone: 'error', title: en.common.errors.integrity(), description: undefined }
	]);
});

test('and a failure that never crossed it is shown as it was written', () => {
	raised.length = 0;

	announceUpdateOutcome({ kind: 'failed', error: new Error('the updater is not configured') }, en);

	assert.deepEqual(raised, [
		{ tone: 'error', title: 'the updater is not configured', description: undefined }
	]);
});

test('a release ready to install is offered with the restart, and stays until it is taken', () => {
	offers.length = 0;
	let restarted = 0;

	offerRestart('0.15.0', () => void restarted++, en);

	assert.equal(offers.length, 1);
	assert.equal(offers[0]?.title, en.update.ready({ version: '0.15.0' }));
	assert.equal(offers[0]?.action?.label, en.update.actions.restart());
	assert.equal(offers[0]?.duration, Number.POSITIVE_INFINITY);

	offers[0]?.action?.onClick();
	assert.equal(restarted, 1);

	// a second offer takes the first off screen rather than standing beside it.
	dismissed.length = 0;
	offerRestart('0.15.1', () => {}, ar);
	assert.deepEqual(dismissed, [1]);
	assert.equal(offers[1]?.title, ar.update.ready({ version: '0.15.1' }));
});

test('where the update stands is one sentence per place it can stand, and a failure says why', () => {
	const release = { version: '0.15.0' };
	const at = (phase: Parameters<typeof describeUpdate>[0]['phase']) =>
		describeUpdate({ phase, release, failure: null }, en);

	assert.equal(at('idle'), en.update.idle());
	assert.equal(at('checking'), en.update.checking());
	assert.equal(at('available'), en.update.available(release));
	assert.equal(at('upToDate'), en.update.upToDate());
	assert.equal(at('downloading'), en.update.downloading(release));
	assert.equal(at('ready'), en.update.ready(release));
	assert.equal(at('installing'), en.update.installing(release));
	assert.equal(
		describeUpdate({ phase: 'idle', release: null, failure: 'offline' }, ar),
		ar.update.offline()
	);
	assert.equal(
		describeUpdate({ phase: 'ready', release, failure: 'failed' }, ar),
		ar.update.failed()
	);
});

test('a check that found a release announces nothing, because the section itself answers it', () => {
	// the available version fills in and the download joins the check. A toast on top of that is
	// the same news twice, and it is the one outcome the card is allowed to answer by itself.
	raised.length = 0;

	assert.equal(describeUpdateOutcome({ kind: 'checked', hasRelease: true }, en), null);

	announceUpdateOutcome({ kind: 'checked', hasRelease: true }, en);

	assert.deepEqual(raised, []);
});
