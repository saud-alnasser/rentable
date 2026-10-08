import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import ReadOnlyNotice from '$lib/organization/component/read-only-notice.svelte';
import type { HeldByVersion, OrganizationSession } from '$lib/organization/host';
import { fakeOrganizationSession } from '$lib/organization/tests/testing';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { resetUpdater } from '$lib/update/updater.svelte';
import { fakeUpdateHost } from '$lib/update/tests/testing';

import Providers from '#tests/providers.svelte';

/**
 * THE READ-ONLY NOTICE
 *
 * Ticket 12 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirement 6 and criterion
 * 6: a session a newer rentable upgraded past what this one writes reads, above every screen of
 * the workspace, that it needs updating to make changes, with the update action in the notice, in
 * English and in Arabic. It is drawn at the shell's `notice` place
 * (`shell/tests/slots.svelte.test.ts`), and it goes as soon as the state reads writable again.
 *
 * **The state is the mock**, held in a rune so a verdict that changes is drawn again, as the
 * heartbeat's read of it is. The update action is drawn and never pressed; its host refuses by
 * name if it were (`update/tests/update-action.svelte.test.ts` drives it).
 */

const reads: { session: OrganizationSession | null; heldByVersion: HeldByVersion[] } = $state({
	session: null,
	heldByVersion: []
});

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return reads.session
				? { session: reads.session, heldByVersion: reads.heldByVersion }
				: undefined;
		}
	})
}));

beforeEach(() => {
	reads.session = null;
	reads.heldByVersion = [];
	document.body.innerHTML = '';
	resetUpdater({ host: fakeUpdateHost(), push: async () => {} });
});

const workspaceReadOnly: HeldByVersion = {
	target: { workspace: 'north' },
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded North Properties'
};

const organizationReadOnly: HeldByVersion = {
	target: 'organization',
	standing: 'readOnly',
	reason: 'a newer version of rentable upgraded the organization'
};

const notice = (direction: 'ltr' | 'rtl' = 'ltr') =>
	render(ReadOnlyNotice, {}, { wrapper: Providers, wrapperProps: { strings, direction } });

const drawn = () => document.querySelector('[data-read-only-notice]');

test('a workspace held read-only says it needs updating to make changes, with the update action', () => {
	loadLocale('en');
	setLocale('en');
	reads.session = fakeOrganizationSession();
	reads.heldByVersion = [workspaceReadOnly];
	notice();

	expect(drawn()?.querySelector('[data-slot=callout]')).not.toBeNull();
	expect(screen.getByText(en.common.refusals.host.workspaceReadOnlyByVersion)).not.toBeNull();
	expect(drawn()?.querySelector('[data-update-action="notice"]')).not.toBeNull();
	expect(drawn()?.querySelector('[data-update-act]')).not.toBeNull();

	// the next read finds it writable: updated, so nothing is said.
	reads.heldByVersion = [];
	flushSync();

	expect(drawn()).toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	reads.session = fakeOrganizationSession();
	reads.heldByVersion = [workspaceReadOnly];
	notice('rtl');

	expect(screen.getByText(ar.common.refusals.host.workspaceReadOnlyByVersion)).not.toBeNull();
	expect(drawn()?.querySelector('[data-update-action="notice"]')).not.toBeNull();
});

test('an organization held read-only says so of the organization, in both languages', () => {
	loadLocale('en');
	setLocale('en');
	reads.session = fakeOrganizationSession();
	reads.heldByVersion = [organizationReadOnly];
	notice();

	expect(screen.getByText(en.common.refusals.host.organizationReadOnlyByVersion)).not.toBeNull();

	document.body.innerHTML = '';
	loadLocale('ar');
	setLocale('ar');
	notice('rtl');

	expect(screen.getByText(ar.common.refusals.host.organizationReadOnlyByVersion)).not.toBeNull();
});

test('a writable session, one past reading, and nobody signed in read nothing', () => {
	loadLocale('en');
	setLocale('en');
	reads.heldByVersion = [workspaceReadOnly];
	notice();

	expect(drawn(), 'nobody signed in').toBeNull();

	reads.session = fakeOrganizationSession();
	reads.heldByVersion = [];
	flushSync();

	expect(drawn(), 'writable').toBeNull();

	// past reading is the workspace-held screen's or the switcher's to say, not this notice's.
	reads.heldByVersion = [{ ...workspaceReadOnly, standing: 'unreadable' }];
	flushSync();

	expect(drawn(), 'past reading').toBeNull();
});

// effort 857, ticket 31: floors that could not be read are not a newer version, so the notice
// says the version record could not be read, and offers no update.
test('a workspace whose floors could not be read says changes are paused, with no update', () => {
	const unread: HeldByVersion = {
		target: { workspace: 'north' },
		standing: 'readOnly',
		reason: 'workspaceFloorsUnreadable'
	};

	loadLocale('en');
	setLocale('en');
	reads.session = fakeOrganizationSession();
	reads.heldByVersion = [unread];
	notice();

	expect(screen.getByText(en.common.refusals.host.workspaceFloorsUnreadable)).not.toBeNull();
	expect(screen.queryByText(en.common.refusals.host.workspaceReadOnlyByVersion)).toBeNull();
	expect(drawn()?.querySelector('[data-update-action]')).toBeNull();

	document.body.innerHTML = '';
	loadLocale('ar');
	setLocale('ar');
	notice('rtl');

	expect(screen.getByText(ar.common.refusals.host.workspaceFloorsUnreadable)).not.toBeNull();
	expect(drawn()?.querySelector('[data-update-action]')).toBeNull();
});

// effort 857, ticket 16: both verdicts cross, and the notice is drawn once, of the organization.
test('an organization and its workspace both read-only draw one notice, of the organization', () => {
	loadLocale('en');
	setLocale('en');
	reads.session = fakeOrganizationSession();
	reads.heldByVersion = [organizationReadOnly, workspaceReadOnly];
	notice();

	expect(document.querySelectorAll('[data-read-only-notice]')).toHaveLength(1);
	expect(screen.getByText(en.common.refusals.host.organizationReadOnlyByVersion)).not.toBeNull();
});
