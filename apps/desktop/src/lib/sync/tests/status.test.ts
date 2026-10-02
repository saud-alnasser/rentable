import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing';
import {
	SYNC_STATUS_TONE,
	syncLastReachedLine,
	syncProblemOf,
	syncStatusOf,
	syncStatusWord,
	type SyncStatus
} from '$lib/sync/status';

/**
 * THE STATE'S ORDER, ITS WORD AND ITS MOMENT
 *
 * Five named states, each in a tone of its own (effort 846, requirement 12), read from the
 * problems in an order that is a decision, and from whether a run is out. *There were six answers
 * until the control plane retired, and four of them described a service; each was a badge's word
 * until effort 828, requirement 25, made it a sentence, and effort 846 gave it back its word and
 * tone.* The order did not move.
 */

const STATUSES: SyncStatus[] = [
	'upToDate',
	'syncing',
	'notYetReached',
	'needsAttention',
	'needsReconnecting'
];

const accountRefused = () => fakeSyncState({ lastReachedAt: 1, accountRefusal: { since: 1 } });
const credentialRefused = () =>
	fakeSyncState({ lastReachedAt: 1, credentialRefusal: { since: 2 } });
const faulted = () =>
	fakeSyncState({
		lastReachedAt: 1,
		workspace: fakeWorkspace({ lastError: 'the replica refused' })
	});

test('a machine that reached turso and has nothing wrong is up to date', () => {
	assert.equal(syncStatusOf(fakeSyncState({ lastReachedAt: 1 })), 'upToDate');
});

// a fresh machine opened offline has reached nothing, and "up to date" was what it said until
// review round two of effort 828.
test('a machine that never reached turso is not yet reached, after the problems', () => {
	assert.equal(syncStatusOf(fakeSyncState()), 'notYetReached');
	assert.equal(
		syncStatusOf(fakeSyncState({ lastReachedAt: null, accountRefusal: { since: 1 } })),
		'needsAttention'
	);
	assert.equal(
		syncStatusOf(fakeSyncState({ lastReachedAt: null, credentialRefusal: { since: 2 } })),
		'needsAttention'
	);
	assert.equal(
		syncStatusOf(
			fakeSyncState({
				lastReachedAt: null,
				workspace: fakeWorkspace({ lastError: 'the replica refused' })
			})
		),
		'needsReconnecting'
	);
});

test('a refused account or credential needs attention, and a fault needs reconnecting', () => {
	assert.equal(syncStatusOf(accountRefused()), 'needsAttention');
	assert.equal(syncStatusOf(credentialRefused()), 'needsAttention');
	assert.equal(syncStatusOf(faulted()), 'needsReconnecting');
});

test('a run in flight is syncing, over up to date and over not yet reached', () => {
	assert.equal(syncStatusOf(fakeSyncState({ lastReachedAt: 1 }), true), 'syncing');
	assert.equal(syncStatusOf(fakeSyncState(), true), 'syncing');
});

// a machine over quota is still over quota while the next attempt is out.
test('a problem keeps its state while a retry runs', () => {
	assert.equal(syncStatusOf(accountRefused(), true), 'needsAttention');
	assert.equal(syncStatusOf(credentialRefused(), true), 'needsAttention');
	assert.equal(syncStatusOf(faulted(), true), 'needsReconnecting');
});

// requirement 25 of effort 819: the account is read first, then the credential, then a fault,
// so the block explains the thing the owner has to see to first.
test('the problems are read account first, then the credential, then a fault', () => {
	const everything = fakeSyncState({
		accountRefusal: { since: 1 },
		credentialRefusal: { since: 2 },
		workspace: fakeWorkspace({ lastError: 'something stale' })
	});

	assert.equal(syncProblemOf(everything), 'accountRefused');
	assert.equal(syncProblemOf({ ...everything, accountRefusal: null }), 'credentialRefused');
	assert.equal(
		syncProblemOf({ ...everything, accountRefusal: null, credentialRefusal: null }),
		'needsReconnect'
	);
	assert.equal(syncProblemOf(fakeSyncState({ lastReachedAt: 1 })), null);
});

test('each state has a tone of its own', () => {
	assert.deepEqual(SYNC_STATUS_TONE, {
		upToDate: 'success',
		syncing: 'info',
		notYetReached: 'neutral',
		needsAttention: 'warning',
		needsReconnecting: 'error'
	});
	assert.equal(new Set(Object.values(SYNC_STATUS_TONE)).size, STATUSES.length);
});

test('each state has a word of its own, in both locales', () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		const LL = i18nObject(locale);
		const words = STATUSES.map((status) => syncStatusWord(status, LL));

		assert.equal(new Set(words).size, STATUSES.length, `${locale}: ${words.join(', ')}`);
	}

	loadLocale('en');
	const LL = i18nObject('en');

	assert.deepEqual(
		STATUSES.map((status) => syncStatusWord(status, LL)),
		['up to date', 'syncing', 'not yet reached', 'needs attention', 'needs reconnecting']
	);
});

// the moment is a line of its own, drawn whenever there is one: relative within a day and the
// date and the time beyond it, and absent before anything reached Turso.
test('the last-reached line says the moment, and how depends on how far back', () => {
	loadLocale('en');
	const LL = i18nObject('en');
	const now = Date.UTC(2026, 8, 15, 14, 0, 0);

	assert.equal(syncLastReachedLine(null, 'en', now, LL), null);
	assert.equal(
		syncLastReachedLine(now - 2 * 60_000, 'en', now, LL),
		'last reached Turso 2 minutes ago'
	);
	assert.equal(
		syncLastReachedLine(now - 23 * 3_600_000, 'en', now, LL),
		'last reached Turso 23 hours ago'
	);

	const old = syncLastReachedLine(now - 3 * 86_400_000, 'en', now, LL);

	assert.ok(old?.startsWith('last reached Turso on '), old ?? 'null');
	assert.ok(old?.includes('2026'), old ?? 'null');
});
