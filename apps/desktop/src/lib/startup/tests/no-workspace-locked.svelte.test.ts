import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { OrganizationSession } from '$lib/organization/host';
import { fakeHeldOrganization, fakeOrganizationSession } from '$lib/organization/tests/testing';
import { fakeSettings } from '$lib/settings/tests/testing';
import StartupNoWorkspace from '$lib/startup/component/no-workspace.svelte';
import Providers from '#tests/providers.svelte';

/**
 * THE LOCKED SENTENCE WITH NO WORKSPACE
 *
 * Effort 851, requirement 32 and criterion 32, ticket 16: a locked member of an organization with
 * no workspace yet never reaches the shell's `notice` place, so the no-workspace screen says the
 * same sentence, in English and in Arabic, under the switcher, and it goes once the session reads
 * unlocked. An unlocked member reads nothing of it.
 *
 * **The session is the mock**, held in a rune so a session that changes is drawn again, as the
 * heartbeat's read of it is (`organization/tests/locked-notice.svelte.test.ts` does the same).
 */

const reads: { session: OrganizationSession | null } = $state({ session: null });

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return reads.session ? { session: reads.session } : undefined;
		}
	})
}));

// the one piece of SvelteKit a superforms submit reaches that this runner cannot supply.
vi.mock('$app/forms', async (original) => ({
	...(await original<Record<string, unknown>>()),
	applyAction: async () => {}
}));

// the settings the foot control reads, which a test has no shell to ask.
vi.mock('$lib/api/caller', () => ({
	default: { settings: { get: async () => fakeSettings(), set: async () => fakeSettings() } }
}));

beforeAll(() => {
	// the popover's floating-ui measures with a `ResizeObserver`, and the appearance reads the
	// system's through `matchMedia`; jsdom has neither.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	})) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
	reads.session = null;
	document.body.innerHTML = '';
});

const noop = () => {};

/** a member who is not the owner, with no workspace to go to: who a locked account is. */
const noWorkspace = (direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		StartupNoWorkspace,
		{
			organizations: [fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals' })],
			selected: 'acme',
			canCreate: false,
			isCreating: false,
			onCreate: noop,
			onSelect: noop,
			onRemove: noop,
			onSetUpOrganization: noop,
			onJoinByLink: noop
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const notice = () => document.querySelector('[data-locked-notice]');

test('a locked member with no workspace reads the locked sentence, until the session reads unlocked', () => {
	loadLocale('en');
	setLocale('en');
	reads.session = fakeOrganizationSession({ locked: true });
	noWorkspace();

	expect(screen.getByText(en.common.refusals.host.locked)).not.toBeNull();
	expect(notice()?.querySelector('[data-slot=callout]')).not.toBeNull();
	// in the step's column, under the switcher of the organization it is about, at the column's
	// measure rather than the shell's page inset.
	expect(notice()?.closest('[data-way-in-content]')).not.toBeNull();
	expect(
		document.querySelector('[data-no-workspace-organization]')?.compareDocumentPosition(notice()!)
	).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(notice()?.getAttribute('class') ?? '').not.toContain('max-w-5xl');
	// the screen still says whose act a workspace is.
	expect(screen.getByText(en.layout.noWorkspace.ownerOnly)).not.toBeNull();

	reads.session = fakeOrganizationSession({ locked: false });
	flushSync();

	expect(notice()).toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	reads.session = fakeOrganizationSession({ locked: true });
	noWorkspace('rtl');

	expect(screen.getByText(ar.common.refusals.host.locked)).not.toBeNull();

	reads.session = fakeOrganizationSession({ locked: false });
	flushSync();

	expect(notice()).toBeNull();

	setLocale('en');
});

test('an unlocked member with no workspace reads nothing of it, in either language', () => {
	for (const [locale, direction] of [
		['en', 'ltr'],
		['ar', 'rtl']
	] as const) {
		loadLocale(locale);
		setLocale(locale);
		document.body.innerHTML = '';
		reads.session = fakeOrganizationSession({ locked: false });
		noWorkspace(direction);

		expect(notice()).toBeNull();
		expect(screen.queryByText((locale === 'en' ? en : ar).common.refusals.host.locked)).toBeNull();
	}

	setLocale('en');
});
