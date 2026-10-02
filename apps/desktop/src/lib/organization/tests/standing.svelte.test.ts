import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Standing from '$lib/organization/component/standing.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { fakeOrganizationSession } from '$lib/organization/tests/testing';
import { syncWorkspaceNow } from '$lib/sync/workspace';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing';

import Providers from '#tests/providers.svelte';

/**
 * THE SYNC GROUP, RENDERED
 *
 * Criterion 12 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: each of
 * the five states with a glyph and a tone of its own, the last time Turso was reached on a line of
 * its own, the control named "sync", and a problem's explanation and act beneath the state. Which
 * state a machine is in is decided in `sync/status.ts` and read in its own test; what is read here
 * is what the group draws for each, in both locales.
 *
 * **Syncing is driven through the sync host**: the shell's port stands in, and its replication is
 * held open until the test lets it go, so the real dispatch runs, is counted while it is out, and
 * the group reads the count. The control starts one; the sync manager's call is the dispatch
 * itself, started here directly.
 */

const { port } = vi.hoisted(() => ({ port: { releases: [] as (() => void)[] } }));

vi.mock('$lib/sync/tauri', async () => {
	const { fakeSyncState } = await import('$lib/sync/tests/testing');

	return {
		tauri: {
			getState: async () => fakeSyncState(),
			replicate: () =>
				new Promise((resolve) => {
					port.releases.push(() =>
						resolve({ pushed: true, received: false, refusal: 'none', standing: 'held' })
					);
				}),
			push: async () => true,
			renameWorkspace: async () => fakeSyncState()
		}
	};
});

/** let every replication that is out answer, and wait for it to land. */
const releaseAll = async () => {
	await waitFor(() => expect(port.releases.length).toBeGreaterThan(0));

	for (const release of port.releases.splice(0)) release();
};

afterEach(() => {
	// nothing a test started is left out for the next one to count.
	for (const release of port.releases.splice(0)) release();
});

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
			wrapper: Providers,
			wrapperProps: { strings, direction: locale === 'ar' ? 'rtl' : 'ltr' }
		}
	);
};

const row = () => document.querySelector<HTMLElement>('[data-standing]')!;
const word = () => row().querySelector('[data-slot=item-title] > span')?.textContent?.trim();
const glyph = () => row().querySelector<HTMLElement>('[data-slot=item-media]')!;
const lastReached = () => row().querySelector('[data-last-reached]')?.textContent?.trim();
const checkNow = () => document.querySelector<HTMLButtonElement>('[data-check-now]')!;

/** the lucide name of the state's glyph, read off its class. */
const glyphName = () =>
	[...(glyph().querySelector('svg')?.classList ?? [])]
		.find((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
		?.replace('lucide-', '');

/** the tone the state's glyph and word are drawn in, read off the classes they carry. */
const toneClass = () =>
	[...glyph().classList].find((name) =>
		/^text-(success|info|warning|destructive|foreground)$/.test(name)
	);

/**
 * what every state is read for: one state row in the settings group, its glyph and its word in
 * the same tone, the group's title and its line, the control named "sync", no badge, and a glyph
 * that stands still.
 */
const shape = (locale: 'en' | 'ar' = 'en') => {
	const words = locale === 'ar' ? ar : en;
	const group = document.querySelector('[data-settings-group]')!;

	expect(group.querySelector('h2')?.textContent?.trim()).toBe(words.organization.standing.title);
	expect(group.textContent).toContain(words.organization.standing.purpose);
	expect(document.querySelectorAll('[data-standing]')).toHaveLength(1);
	expect(row().hasAttribute('data-settings-row')).toBe(true);
	expect(row().querySelector('[data-slot="item-title"]')?.className).toContain(toneClass());
	expect(checkNow().textContent?.trim()).toBe(words.organization.standing.checkNow);
	expect(checkNow().querySelector('svg')).not.toBeNull();
	expect(document.querySelector('[data-slot="badge"]')).toBeNull();
	expect(glyph().querySelector('svg')?.getAttribute('class') ?? '').not.toMatch(/animate-/);
};

const STATES = [
	{
		name: 'up to date',
		state: () => fakeSyncState({ lastReachedAt: Date.now() - 2 * MINUTE }),
		standing: 'upToDate',
		word: en.organization.standing.state.upToDate,
		glyph: 'circle-check',
		tone: 'text-success'
	},
	{
		name: 'not yet reached',
		state: () => fakeSyncState(),
		standing: 'notYetReached',
		word: en.organization.standing.state.notYetReached,
		glyph: 'cloud-off',
		tone: 'text-foreground'
	},
	{
		name: 'needs attention',
		state: () => fakeSyncState({ lastReachedAt: 1, accountRefusal: { since: 1 } }),
		standing: 'needsAttention',
		word: en.organization.standing.state.needsAttention,
		glyph: 'triangle-alert',
		tone: 'text-warning'
	},
	{
		name: 'needs reconnecting',
		state: () => fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) }),
		standing: 'needsReconnecting',
		word: en.organization.standing.state.needsReconnecting,
		glyph: 'octagon-x',
		tone: 'text-destructive'
	}
] as const;

for (const each of STATES) {
	test(`${each.name}: its word, its own glyph and its own tone`, () => {
		block({ syncState: each.state() });

		expect(row().dataset.standing).toBe(each.standing);
		expect(word()).toBe(each.word);
		expect(glyphName()).toBe(each.glyph);
		expect(toneClass()).toBe(each.tone);
		shape();
	});
}

test('syncing, started by the control: its word, its glyph standing still, and its tone', async () => {
	block({ syncState: fakeSyncState({ lastReachedAt: Date.now() - 2 * MINUTE }) });

	await fireEvent.click(checkNow());

	await waitFor(() => expect(row().dataset.standing).toBe('syncing'));
	expect(word()).toBe(en.organization.standing.state.syncing);
	expect(glyphName()).toBe('refresh-cw');
	expect(toneClass()).toBe('text-info');
	shape();
	// the control keeps its name, and is not pressed twice while a run is out.
	expect(checkNow().disabled).toBe(true);

	await releaseAll();

	await waitFor(() => expect(row().dataset.standing).toBe('upToDate'));
	expect(checkNow().disabled).toBe(false);
});

test('syncing over not yet reached, started by the sync manager rather than the control', async () => {
	block();

	expect(row().dataset.standing).toBe('notYetReached');

	const run = syncWorkspaceNow();

	await waitFor(() => expect(row().dataset.standing).toBe('syncing'));

	await releaseAll();
	await run;

	await waitFor(() => expect(row().dataset.standing).toBe('notYetReached'));
});

test('the five glyphs and the five tones are each distinct', async () => {
	const seen = new Map<string, { glyph?: string; tone?: string }>();

	for (const each of STATES) {
		const { unmount } = block({ syncState: each.state() });

		seen.set(each.standing, { glyph: glyphName(), tone: toneClass() });
		unmount();
	}

	block();
	const run = syncWorkspaceNow();
	await waitFor(() => expect(row().dataset.standing).toBe('syncing'));
	seen.set('syncing', { glyph: glyphName(), tone: toneClass() });
	await releaseAll();
	await run;

	expect(seen.size).toBe(5);
	expect(new Set([...seen.values()].map((each) => each.glyph)).size).toBe(5);
	expect(new Set([...seen.values()].map((each) => each.tone)).size).toBe(5);
});

// a machine over quota is still over quota while the next attempt is out.
test('a problem keeps its state while a retry runs', async () => {
	block({ syncState: fakeSyncState({ lastReachedAt: 1, accountRefusal: { since: 1 } }) });

	const run = syncWorkspaceNow();

	await waitFor(() => expect(port.releases.length).toBeGreaterThan(0));
	expect(row().dataset.standing).toBe('needsAttention');
	expect(document.querySelector('[data-account-refusal]')).not.toBeNull();

	await releaseAll();
	await run;
});

test('the last-reached line: relative within a day, in the words of the locale', () => {
	block({ syncState: fakeSyncState({ lastReachedAt: Date.now() - 2 * MINUTE }) });

	expect(lastReached()).toBe(
		en.organization.standing.lastReachedRecently.replace('{moment:string}', '2 minutes ago')
	);

	block({ syncState: fakeSyncState({ lastReachedAt: Date.now() - 3 * 60 * MINUTE }) }, 'ar');

	expect([...document.querySelectorAll('[data-last-reached]')].at(-1)?.textContent?.trim()).toBe(
		ar.organization.standing.lastReachedRecently.replace('{moment}', 'قبل 3 ساعات')
	);
});

test('the last-reached line beyond a day is the date and the time, under any state', () => {
	const moment = Date.now() - 3 * DAY;
	const written = new Intl.DateTimeFormat('en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(moment);

	block({
		syncState: fakeSyncState({
			lastReachedAt: moment,
			workspace: fakeWorkspace({ lastError: 'the replica refused' })
		})
	});

	expect(row().dataset.standing).toBe('needsReconnecting');
	expect(lastReached()).toBe(
		en.organization.standing.lastReached.replace('{moment:string}', written)
	);
});

// effort 846, *Detail that few readers need folds under its row*: the workspace this machine keeps
// and where its copy is fold under the state, closed, while the state, the last reach and sync stay.
test('what this machine keeps folds under the state, closed, and the state stays in view', async () => {
	block({ syncState: fakeSyncState({ lastReachedAt: Date.now() - 2 * MINUTE }) });

	const chevron = row().querySelector<HTMLElement>('[data-row-details-trigger]')!;

	expect(chevron.getAttribute('aria-expanded')).toBe('false');
	expect(chevron.getAttribute('aria-label')).toBe(en.organization.standing.detail.label);
	expect(row().querySelector('[data-standing-detail]')).toBeNull();
	expect(word()).toBe(en.organization.standing.state.upToDate);
	expect(lastReached()).toBeDefined();
	expect(checkNow()).not.toBeNull();

	await fireEvent.click(chevron);

	const detail = row().querySelector('[data-standing-detail]')!;

	expect(detail.textContent).toContain(fakeSyncState().workspace.name);
	expect(detail.textContent).toContain(fakeSyncState().workspace.localDatabasePath);
});

test('before any replication went there is no last-reached line, and nothing beneath', () => {
	block();

	expect(lastReached()).toBeUndefined();
	expect(document.querySelector('[data-standing-beneath]')).toBeNull();
	expect(document.querySelector('[data-open-dashboard]')).toBeNull();
});

/** the explanation sits inside the state's row, after the state's word. */
const beneathTheState = (selector: string) => {
	const explanation = row().querySelector(selector);

	expect(explanation).not.toBeNull();
	expect(
		row().querySelector('[data-slot=item-title]')!.compareDocumentPosition(explanation!) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
};

test('the account refused, read by a member: whom to tell, under the state, and no dashboard', () => {
	block({
		syncState: fakeSyncState({ accountRefusal: { since: 1 } }),
		session: fakeOrganizationSession({
			role: 'member',
			permissions: 0,
			ownerUsername: 'olivia.owner'
		})
	});

	beneathTheState('[data-account-refusal="member"]');
	expect(row().querySelector('[data-account-refusal]')?.textContent).toContain('olivia.owner');
	expect(document.querySelector('[data-open-dashboard]')).toBeNull();
});

test('the account refused, read by the owner: the sentence and the dashboard, with its glyph', () => {
	block({
		syncState: fakeSyncState({ accountRefusal: { since: 1 } }),
		session: fakeOrganizationSession({ role: 'owner' })
	});

	beneathTheState('[data-account-refusal="owner"]');
	beneathTheState('[data-open-dashboard]');

	const dashboard = document.querySelector('[data-open-dashboard]')!;

	expect(dashboard.textContent?.trim()).toBe(en.organization.setup.openDashboard);
	expect(dashboard.querySelector('svg.lucide-external-link')).not.toBeNull();
});

test("this machine's access refused: needs attention, and the credential's sentence under it", () => {
	block({ syncState: fakeSyncState({ credentialRefusal: { since: 2 } }) });

	expect(row().dataset.standing).toBe('needsAttention');
	beneathTheState('[data-credential-refusal]');
	expect(document.querySelector('[data-credential-refusal]')?.textContent?.trim()).toBe(
		en.workspace.credentialRefused
	);
	expect(document.querySelector('[data-account-refusal]')).toBeNull();
});

test('a fault on the replica: needs reconnecting, and the fault behind details under it', () => {
	block({
		syncState: fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) })
	});

	beneathTheState('[data-fault]');
	expect(document.querySelector('[data-fault]')?.textContent?.trim()).toBe(
		en.common.messages.unexpectedError
	);
	beneathTheState('[data-error-detail="fault"]');
	// the reconnect is the Turso account group's, and nothing points at it while the machine
	// holds the authority.
	expect(document.querySelector('[data-reconnect-pointer]')).toBeNull();
});

// the plan lists the reconnect beneath this state where the machine holds no authority; the
// group points at the Turso account card by name rather than drawing a second consent.
test('and where the machine holds no authority, a line points at the Turso account card', () => {
	block({
		syncState: fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) }),
		session: fakeOrganizationSession({ role: 'owner' }),
		needsAuthority: true
	});

	beneathTheState('[data-reconnect-pointer]');
	expect(document.querySelector('[data-reconnect-pointer]')?.textContent?.trim()).toBe(
		en.organization.standing.reconnectOnAccount
	);
});

// every state, in Arabic, written: none of them is the English string under an Arabic key.
test('each state reads in arabic', () => {
	const states = [
		fakeSyncState({ lastReachedAt: Date.now() }),
		fakeSyncState(),
		fakeSyncState({ accountRefusal: { since: 1 } }),
		fakeSyncState({ workspace: fakeWorkspace({ lastError: 'the replica refused' }) })
	];
	const keys = ['upToDate', 'notYetReached', 'needsAttention', 'needsReconnecting'] as const;

	states.forEach((syncState, index) => {
		const { unmount } = block({ syncState }, 'ar');

		expect(word()).toBe(ar.organization.standing.state[keys[index]]);
		expect(word()).not.toBe(en.organization.standing.state[keys[index]]);
		shape('ar');

		unmount();
	});
});

// effort 832, requirement 23: what the replica said is English whatever the reader's language, so
// it is reachable only by asking for it.
test('in arabic, a fault reads as the arabic sentence and the english is behind details', async () => {
	const english = 'the replica refused: database disk image is malformed';

	block({ syncState: fakeSyncState({ workspace: fakeWorkspace({ lastError: english }) }) }, 'ar');

	expect(document.querySelector('[data-fault]')?.textContent?.trim()).toBe(
		ar.common.messages.unexpectedError
	);
	expect(document.body.textContent).not.toContain(english);

	await fireEvent.click(
		document.querySelector<HTMLButtonElement>('[data-error-detail="fault"] button')!
	);

	await waitFor(() => {
		expect(document.querySelector('[data-error-detail-text="fault"]')?.textContent?.trim()).toBe(
			english
		);
	});
});
