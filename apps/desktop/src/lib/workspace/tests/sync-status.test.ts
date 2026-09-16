import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing';
import { syncStandingSentence, syncStatusOf } from '$lib/workspace/sync-status';

/**
 * THE STANDING'S ORDER, AND ITS SENTENCE
 *
 * Four answers, in an order that is a decision. *There were six until the control plane
 * retired, and four of them described a service.* Each answer was a badge's word until effort
 * 828, requirement 25, and is a sentence now; the order did not move.
 */

test('a machine reaching its workspace reads as synced', () => {
	assert.equal(syncStatusOf(fakeSyncState()), 'synced');
});

test('a fault on the workspace needs reconnecting', () => {
	const state = fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) });

	assert.equal(syncStatusOf(state), 'needsReconnect');
});

// requirement 25: the account's refusal is read before a fault, because it is the thing the
// owner has to see to first, and it is its own answer rather than a reconnect.
test('the account being refused reads first, and apart from a fault', () => {
	const refused = fakeSyncState({
		accountRefusal: { since: 1 },
		workspace: fakeWorkspace({ lastError: 'something stale' })
	});

	assert.equal(syncStatusOf(refused), 'accountRefused');
	assert.notEqual(syncStatusOf(refused), syncStatusOf(fakeSyncState()));
});

// F5: a credential Turso refused and a reconnect did not settle is its own answer, read before a
// fault (a definite reason nothing syncs, where a fault is a stale report) and after the account's
// (which is the owner's to see to first).
test('a refused credential reads as its own status, after the account and before a fault', () => {
	const state = fakeSyncState({
		credentialRefusal: { since: 2 },
		workspace: fakeWorkspace({ lastError: 'something stale' })
	});

	assert.equal(syncStatusOf(state), 'credentialRefused');

	const account = fakeSyncState({
		accountRefusal: { since: 1 },
		credentialRefusal: { since: 2 }
	});
	assert.equal(syncStatusOf(account), 'accountRefused');
});

// effort 828, requirement 25: synced says the moment, relative within a day and as a date
// beyond it, and says the word alone before any replication went; a standing that needs
// something says what needs doing and nothing about a moment.
test('synced says when this machine last reached turso, and how depends on how far back', () => {
	loadLocale('en');
	const LL = i18nObject('en');
	const now = Date.UTC(2026, 8, 15, 14, 0, 0);

	assert.equal(syncStandingSentence('synced', null, 'en', now, LL), 'up to date');
	assert.equal(
		syncStandingSentence('synced', now - 2 * 60_000, 'en', now, LL),
		'up to date, checked 2 minutes ago'
	);
	assert.equal(
		syncStandingSentence('synced', now - 23 * 3_600_000, 'en', now, LL),
		'up to date, checked 23 hours ago'
	);

	const old = syncStandingSentence('synced', now - 3 * 86_400_000, 'en', now, LL);

	assert.ok(old.startsWith('last reached turso on '), old);
	assert.ok(!old.includes('up to date'), old);
	assert.ok(old.includes('2026'), old);
});

test('a standing that needs something says what needs doing, whatever the moment', () => {
	loadLocale('en');
	const LL = i18nObject('en');
	const now = Date.UTC(2026, 8, 15, 14, 0, 0);

	for (const moment of [null, now - 60_000, now - 3 * 86_400_000]) {
		assert.equal(
			syncStandingSentence('accountRefused', moment, 'en', now, LL),
			'the turso account needs attention'
		);
		assert.equal(
			syncStandingSentence('credentialRefused', moment, 'en', now, LL),
			"this machine's access needs attention"
		);
		assert.equal(
			syncStandingSentence('needsReconnect', moment, 'en', now, LL),
			'this machine needs reconnecting'
		);
	}
});

// none of the sentences carries the word, in either locale: the block is read by somebody
// asking whether their machine is reaching the organization, and "sync" answers nothing.
test('no sentence says sync, in either locale', () => {
	const now = Date.UTC(2026, 8, 15, 14, 0, 0);

	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		const LL = i18nObject(locale);

		for (const status of [
			'accountRefused',
			'credentialRefused',
			'needsReconnect',
			'synced'
		] as const) {
			for (const moment of [null, now - 60_000, now - 3 * 86_400_000]) {
				const sentence = syncStandingSentence(status, moment, locale, now, LL);

				assert.ok(!/sync/i.test(sentence), `${locale} ${status}: ${sentence}`);
				assert.ok(!sentence.includes('مزامن'), `${locale} ${status}: ${sentence}`);
			}
		}
	}
});
