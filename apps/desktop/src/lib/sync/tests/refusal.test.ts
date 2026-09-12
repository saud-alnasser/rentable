import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { fakeSyncState } from '$lib/platform/tests/testing';
import { accountRefusalSentence } from '$lib/sync/refusal';
import { syncStatusLabel, syncStatusOf } from '$lib/workspace/sync-status';

/**
 * REQUIREMENT 25, IN WORDS
 *
 * Two readers, two sentences, and one thing that must never cross between them: what Turso said.
 * The member's sentence names whom to tell and nothing about quotas, plans or usage; the owner's
 * carries Turso's own detail and says where on Turso to go. And the account's refusal is a
 * different sentence from being offline, in both locales, because a person over quota and a
 * person whose network is down need different things.
 */

const DETAIL = 'databases BLOCKED: quota exceeded, 5 GB of 5 GB storage used on the free plan';

for (const locale of ['en', 'ar'] as const) {
	loadLocale(locale);
	const LL = i18nObject(locale);

	test(`a member is told the account needs attention and whom to tell, and no detail (${locale})`, () => {
		const sentence = accountRefusalSentence(
			{ isOwner: false, ownerDisplayName: 'Olivia Owner', detail: DETAIL },
			LL
		);

		assert.ok(sentence.includes('Olivia Owner'), sentence);

		for (const word of ['quota', '5 GB', 'free plan', 'BLOCKED', 'storage']) {
			assert.ok(!sentence.includes(word), `the member's sentence carries ${word}: ${sentence}`);
		}
	});

	test(`the owner is told which limit and where on turso to go (${locale})`, () => {
		const sentence = accountRefusalSentence(
			{ isOwner: true, ownerDisplayName: 'Olivia Owner', detail: DETAIL },
			LL
		);

		assert.ok(sentence.includes(DETAIL), sentence);
		assert.ok(sentence.includes('app.turso.tech'), sentence);
		// and without the word "group" being something the owner has to know already.
		assert.ok(!/\bgroup\b.*\bgroup\b/.test(sentence), sentence);
	});

	test(`the account's refusal reads apart from being offline (${locale})`, () => {
		const refused = syncStatusOf(fakeSyncState({ accountRefusal: { since: 1 } }));
		const offline = syncStatusOf(
			fakeSyncState({ workspace: { ...fakeSyncState().workspace, lastError: 'offline' } })
		);

		assert.equal(refused, 'accountRefused');
		assert.notEqual(refused, offline);
		assert.notEqual(syncStatusLabel(refused, LL), syncStatusLabel(offline, LL));
		assert.notEqual(syncStatusLabel(refused, LL), syncStatusLabel('synced', LL));
	});
}

// the refusal is read before every other answer: a machine that is also disconnected is told
// about the account, because that is the thing the owner has to see to first.
test('the account refusal is read before a stale disconnection', () => {
	const state = fakeSyncState({
		accountRefusal: { since: 1 },
		workspace: { ...fakeSyncState().workspace, lastError: 'something stale' }
	});

	assert.equal(syncStatusOf(state), 'accountRefused');
});
