import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import LockedNotice from '$lib/organization/component/locked-notice.svelte';
import type { OrganizationSession } from '$lib/organization/host';
import { fakeOrganizationSession } from '$lib/organization/tests/testing';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import Providers from '#tests/providers.svelte';

/**
 * THE LOCKED SENTENCE
 *
 * Effort 851, requirement 32 and criterion 32: a locked session reads, above every screen of the
 * workspace, that the account is locked until an owner or a manager unlocks it, in English and in
 * Arabic, and the sentence goes once the session reads unlocked. It is drawn at the shell's
 * `notice` place (`shell/tests/slots.svelte.test.ts` reads that it is the one drawn there).
 *
 * **The session is the mock**, held in a rune so a session that changes is drawn again, as the
 * heartbeat's read of it is.
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

beforeEach(() => {
	reads.session = null;
	document.body.innerHTML = '';
});

const notice = (direction: 'ltr' | 'rtl' = 'ltr') =>
	render(LockedNotice, {}, { wrapper: Providers, wrapperProps: { strings, direction } });

const drawn = () => document.querySelector('[data-locked-notice]');

test('a locked session reads that the account is locked, until the session reads unlocked', () => {
	loadLocale('en');
	setLocale('en');
	reads.session = fakeOrganizationSession({ locked: true });
	notice();

	expect(drawn()).not.toBeNull();
	expect(screen.getByText(en.common.refusals.host.locked)).not.toBeNull();
	expect(drawn()?.querySelector('[data-slot=callout]')).not.toBeNull();

	reads.session = fakeOrganizationSession({ locked: false });
	flushSync();

	expect(drawn()).toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	reads.session = fakeOrganizationSession({ locked: true });
	notice('rtl');

	expect(screen.getByText(ar.common.refusals.host.locked)).not.toBeNull();
});

test('an unlocked session, and nobody signed in, read nothing', () => {
	loadLocale('en');
	setLocale('en');
	notice();

	expect(drawn()).toBeNull();

	reads.session = fakeOrganizationSession({ locked: false });
	flushSync();

	expect(drawn()).toBeNull();
});
