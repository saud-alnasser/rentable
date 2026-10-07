import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationName from '$lib/organization/component/name.svelte';
import type { OrganizationSession, UpgradeAwaiting } from '$lib/organization/host';
import { fakeOrganizationSession } from '$lib/organization/tests/testing';
import { closeUpgrade, upgradeSheet } from '$lib/organization/upgrade/sheet.svelte';
import { BUILT_IN, EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';

/**
 * THE ORGANIZATION'S CARD MARKS AN UPGRADE AVAILABLE
 *
 * Ticket 08 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirement 3: the
 * organization's card, the first in its settings tab, marks an upgrade waiting on the
 * organization for whoever may run it, and nobody else, with the one act that opens the sheet on
 * it. A workspace's card is read with its directory (`workspace/tests/directory.svelte.test.ts`).
 */

const reads: { awaiting: UpgradeAwaiting | undefined; enabled: boolean[] } = {
	awaiting: undefined,
	enabled: []
};

vi.mock('$lib/organization/upgrade/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/upgrade/query')>()),
	useFetchUpgradeAwaiting: (enabled: () => boolean = () => true) => ({
		get data() {
			reads.enabled.push(enabled());

			return enabled() ? reads.awaiting : undefined;
		}
	})
}));

const WAITING: UpgradeAwaiting = {
	organization: [{ number: 4, needsOwner: false }],
	workspaces: {}
};

const OWNER = fakeOrganizationSession({ permissions: maskOf(...EVERY_FLAG) });
const MANAGER = fakeOrganizationSession({
	role: 'manager',
	roleId: 'manager',
	permissions: BUILT_IN.manager.mask
});
const MEMBER = fakeOrganizationSession({
	role: 'member',
	roleId: 'member',
	permissions: BUILT_IN.member.mask
});

beforeEach(() => {
	document.body.innerHTML = '';
	closeUpgrade();
	reads.awaiting = WAITING;
	reads.enabled = [];
	loadLocale('en');
	setLocale('en');
});

const card = (session: OrganizationSession, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		OrganizationName,
		{ session },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const mark = () =>
	document.querySelector<HTMLElement>('[data-organization-name] [data-upgrade-mark]');

test('the owner and a manager meet the mark on the card, and its act opens the sheet on the organization', async () => {
	for (const session of [OWNER, MANAGER]) {
		document.body.innerHTML = '';
		closeUpgrade();
		card(session);

		expect(mark()?.getAttribute('data-upgrade-mark')).toBe('organization');
		expect(mark()?.textContent).toContain(en.organization.upgrade.available);
		expect(mark()?.textContent).toContain(en.organization.upgrade.availableOrganization);

		const review = mark()!.querySelector<HTMLButtonElement>('[data-upgrade-review]')!;

		expect(review.textContent?.trim()).toBe(en.organization.upgrade.review);
		// words alone: the row already shows the upgrade's glyph.
		expect(review.querySelector('svg')).toBeNull();

		await fireEvent.click(review);

		expect(upgradeSheet.target).toBe('organization');
	}
});

test('a member who may not run it meets no mark, and what waits is not even asked', () => {
	card(MEMBER);

	expect(mark()).toBeNull();
	expect(reads.enabled.every((enabled) => !enabled)).toBe(true);
});

test('a locked manager meets no mark', () => {
	card({ ...MANAGER, locked: true });

	expect(mark()).toBeNull();
});

test('with nothing waiting on the organization, or not known yet, there is no mark', () => {
	reads.awaiting = { organization: [], workspaces: { north: [{ number: 8, needsOwner: false }] } };
	card(OWNER);
	expect(mark()).toBeNull();

	document.body.innerHTML = '';
	reads.awaiting = undefined;
	card(OWNER);
	expect(mark()).toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	card(OWNER, 'rtl');

	expect(mark()?.textContent).toContain(ar.organization.upgrade.available);
	expect(mark()?.textContent).toContain(ar.organization.upgrade.availableOrganization);
	expect(mark()?.querySelector('[data-upgrade-review]')?.textContent?.trim()).toBe(
		ar.organization.upgrade.review
	);
});
