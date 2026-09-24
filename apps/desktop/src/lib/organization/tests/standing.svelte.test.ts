import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Standing from '$lib/organization/component/standing.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { fakeOrganizationSession, fakeSyncState, fakeWorkspace } from '$lib/platform/tests/testing';

import QueryProviders from './query-providers.svelte';

/**
 * THE STANDING BLOCK, RENDERED
 *
 * Criterion 25 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]]: one
 * sentence per standing, the moment where there is one, one control named "sync", no badge, and
 * the word "sync" on nothing but that control, which the human named so on 2026-09-17. Which
 * standing a state is in is decided in `workspace/sync-status.ts` and read in its own test; what
 * is read here is what the block draws for each answer, in both locales.
 *
 * **The replication is stood in for**, because the control runs the sync mutation and the
 * mutation reaches the shell, which this runner has none of. What the stand-in answers is held
 * open until the test lets it go, which is how the control is read while it runs.
 */

const { replication } = vi.hoisted(() => ({
	replication: { resolve: () => {} }
}));

vi.mock('$lib/sync/workspace', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sync/workspace')>()),
	syncWorkspaceNow: () =>
		new Promise((resolve) => {
			replication.resolve = () =>
				resolve({
					state: fakeSyncState(),
					action: 'none',
					received: false,
					pushed: true,
					refusal: 'none',
					standing: 'held'
				});
		})
}));

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const block = (
	overrides: Partial<Parameters<typeof render<typeof Standing>>[1]> = {},
	locale: 'en' | 'ar' = 'en'
) => {
	loadLocale(locale);
	setLocale(locale);

	return render(
		Standing,
		{
			syncState: fakeSyncState(),
			session: fakeOrganizationSession({ role: 'member', permissions: 0 }),
			...overrides
		},
		{
			wrapper: QueryProviders,
			wrapperProps: { strings, direction: locale === 'ar' ? 'rtl' : 'ltr' }
		}
	);
};

const sentences = () =>
	[...document.querySelectorAll<HTMLElement>('[data-standing-sentence]')].map((element) =>
		element.textContent?.trim()
	);

const sentence = () => {
	expect(sentences()).toHaveLength(1);

	return sentences()[0];
};

const checkNow = () => document.querySelector<HTMLButtonElement>('[data-check-now]')!;

/** the rendered text with the control's own label taken out: the word "sync" lives there and nowhere else. */
const textOutsideTheControl = () =>
	(document.body.textContent ?? '').replace(checkNow()?.textContent ?? '', '');

/**
 * what every standing is read for: the legend and the sentence of purpose above, exactly one
 * status sentence, the control, no badge, and the word "sync" on the control alone.
 */
const shape = (locale: 'en' | 'ar' = 'en') => {
	const words = locale === 'ar' ? ar : en;

	expect(document.querySelector('legend')?.textContent?.trim()).toBe(
		words.organization.standing.title
	);
	expect(document.querySelector('[data-standing-purpose]')?.textContent?.trim()).toBe(
		words.organization.standing.purpose
	);
	expect(sentences()).toHaveLength(1);
	expect(checkNow()).not.toBeNull();
	expect(document.querySelector('[data-slot="badge"]')).toBeNull();
	expect(textOutsideTheControl().toLowerCase()).not.toContain('sync');
};

// a machine that never reached turso is not up to date and says so: a fresh machine opened
// offline read "up to date" until review round two of effort 828.
test('before any replication went: the machine has not reached turso, and the control', () => {
	block();

	expect(sentence()).toBe(en.organization.standing.notYetReached);
	expect(sentence()).not.toContain('up to date');
	expect(checkNow().textContent?.trim()).toBe(en.organization.standing.checkNow);
	shape();

	// and nothing beneath: no refusal, no fault, no dashboard.
	expect(document.querySelector('[data-account-refusal]')).toBeNull();
	expect(document.querySelector('[data-credential-refusal]')).toBeNull();
	expect(document.querySelector('[data-fault]')).toBeNull();
	expect(document.querySelector('[data-open-dashboard]')).toBeNull();
});

test('up to date with a moment within the day says it relative, in the words of the locale', () => {
	block({ syncState: fakeSyncState({ lastReachedAt: Date.now() - 2 * MINUTE }) });

	expect(sentence()).toBe(
		en.organization.standing.upToDateChecked.replace('{moment:string}', '2 minutes ago')
	);
	shape();

	block({ syncState: fakeSyncState({ lastReachedAt: Date.now() - 3 * 60 * MINUTE }) }, 'ar');

	expect(sentences().at(-1)).toBe(
		ar.organization.standing.upToDateChecked.replace('{moment}', 'قبل 3 ساعات')
	);
});

// reached once and not since: a machine that has not reached Turso in days is not one this
// block can call up to date, so the sentence is the last reach, with its date and time.
test('a moment further back than a day is the last reach, with the date and the time', () => {
	const moment = Date.now() - 3 * DAY;
	const written = new Intl.DateTimeFormat('en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(moment);

	block({ syncState: fakeSyncState({ lastReachedAt: moment }) });

	expect(sentence()).toBe(en.organization.standing.lastReached.replace('{moment:string}', written));
	expect(sentence()).not.toContain('up to date');
	shape();
});

test('the account refused: what needs doing, the member is told whom to tell, and no dashboard', () => {
	block({
		syncState: fakeSyncState({ accountRefusal: { since: 1 } }),
		session: fakeOrganizationSession({
			role: 'member',
			permissions: 0,
			ownerUsername: 'olivia.owner'
		})
	});

	expect(sentence()).toBe(en.organization.standing.accountNeedsAttention);
	shape();

	const refusal = document.querySelector('[data-account-refusal="member"]');

	expect(refusal?.textContent).toContain('olivia.owner');
	expect(document.querySelector('[data-open-dashboard]')).toBeNull();
});

test('the account refused, read by the owner: the sentence and the dashboard control', () => {
	block({
		syncState: fakeSyncState({ accountRefusal: { since: 1 } }),
		session: fakeOrganizationSession({ role: 'owner' })
	});

	expect(sentence()).toBe(en.organization.standing.accountNeedsAttention);
	shape();
	expect(document.querySelector('[data-account-refusal="owner"]')).not.toBeNull();
	expect(document.querySelector('[data-open-dashboard]')?.textContent?.trim()).toBe(
		en.organization.setup.openDashboard
	);
});

test("this machine's access refused: what needs doing, and the credential's sentence", () => {
	block({ syncState: fakeSyncState({ credentialRefusal: { since: 2 } }) });

	expect(sentence()).toBe(en.organization.standing.accessNeedsAttention);
	shape();
	expect(document.querySelector('[data-credential-refusal]')?.textContent?.trim()).toBe(
		en.workspace.credentialRefused
	);
	expect(document.querySelector('[data-account-refusal]')).toBeNull();
});

test('a fault on the replica: this machine needs reconnecting, and the fault in its own words', () => {
	block({
		syncState: fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) })
	});

	expect(sentence()).toBe(en.organization.standing.needsReconnecting);
	shape();
	expect(document.querySelector('[data-fault]')?.textContent?.trim()).toBe('the replica refused');
	// the reconnect is the Turso account block's, and nothing points at it while the machine
	// holds the authority.
	expect(document.querySelector('[data-reconnect-below]')).toBeNull();
});

// the plan lists the reconnect beneath this standing where the machine holds no authority; the
// block points at the Turso account block below it rather than drawing a second consent.
test('and where the machine holds no authority, the sentence points at the reconnect below', () => {
	block({
		syncState: fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) }),
		session: fakeOrganizationSession({ role: 'owner' }),
		needsAuthority: true
	});

	expect(sentence()).toBe(en.organization.standing.needsReconnecting);
	shape();
	expect(document.querySelector('[data-reconnect-below]')?.textContent?.trim()).toBe(
		en.organization.standing.reconnectBelow
	);
});

test('the control reads syncing while the replication runs, and sync again after', async () => {
	block();

	await fireEvent.click(checkNow());

	await waitFor(() => {
		expect(checkNow().textContent?.trim()).toBe(en.organization.standing.checking);
	});
	expect(checkNow().disabled).toBe(true);

	replication.resolve();

	await waitFor(() => {
		expect(checkNow().textContent?.trim()).toBe(en.organization.standing.checkNow);
	});
	expect(checkNow().disabled).toBe(false);
});

// every sentence, in Arabic, written: none of them is the English string under an Arabic key,
// and the word "sync" is on none of them either, the control being where it lives.
test('each standing reads in arabic, and none of it says sync', () => {
	const states = [
		fakeSyncState(),
		fakeSyncState({ accountRefusal: { since: 1 } }),
		fakeSyncState({ credentialRefusal: { since: 2 } }),
		fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) })
	];
	const expected = [
		ar.organization.standing.notYetReached,
		ar.organization.standing.accountNeedsAttention,
		ar.organization.standing.accessNeedsAttention,
		ar.organization.standing.needsReconnecting
	];
	const english = [
		en.organization.standing.notYetReached,
		en.organization.standing.accountNeedsAttention,
		en.organization.standing.accessNeedsAttention,
		en.organization.standing.needsReconnecting
	];

	states.forEach((syncState, index) => {
		const { unmount } = block({ syncState }, 'ar');

		expect(sentence()).toBe(expected[index]);
		expect(sentence()).not.toBe(english[index]);
		expect(checkNow().textContent?.trim()).toBe(ar.organization.standing.checkNow);
		shape('ar');
		expect(textOutsideTheControl().toLowerCase()).not.toContain('sync');
		expect(textOutsideTheControl()).not.toContain('مزامن');

		unmount();
	});
});
