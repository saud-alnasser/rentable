import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Invitations from '$lib/organization/component/invitations.svelte';
import type { OrganizationMember, PendingInvitation } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE PENDING ACCOUNTS, RENDERED
 *
 * Requirement 22 of the redesign: an account is made at invite and is pending until its first
 * sign-in, and the row names it by the one username the account was made with, no address and
 * no display name (requirement 21). The standing badge and the revoke are 819's and stay; what
 * is pinned here is the name on the row, the empty sentence, and that both read in both locales.
 * The section's title is the page's, and `i18n/tests/organization.test.ts` reads it there.
 *
 * **The rows are members carrying an unspent invitation**, which is where effort 826 put the
 * pending mark; a member with none is not a row here.
 */

const noop = () => {};

const pending = (overrides: Partial<PendingInvitation>): PendingInvitation => ({
	invitationId: 'invitation',
	expiresAt: Date.UTC(2026, 8, 20),
	standing: 'open',
	canCopy: true,
	...overrides
});

const member = (overrides: Partial<OrganizationMember>): OrganizationMember => ({
	id: 'm',
	username: 'member',
	role: 'member',
	permissions: 0,
	workspaces: [],
	pending: pending({}),
	createdAt: 0,
	...overrides
});

const members = [
	member({ id: 'sami', username: 'sami.staff', pending: pending({ invitationId: 'i-sami' }) }),
	member({
		id: 'lina',
		username: 'lina_h',
		pending: pending({ invitationId: 'i-lina', standing: 'lapsed' })
	}),
	// somebody who has signed in: no pending mark, and no row here.
	member({ id: 'olivia', username: 'olivia', pending: null })
];

const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const list = (
	overrides: Partial<Parameters<typeof render<typeof Invitations>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		Invitations,
		{ members, canInvite: true, revoking: null, onRevoke: noop, ...overrides },
		inProvider(direction)
	);

const usernamesOnScreen = () =>
	Array.from(document.querySelectorAll('[data-pending-username]')).map((node) =>
		node.textContent?.trim()
	);

test('each pending account is named by its username, and by nothing else', () => {
	loadLocale('en');
	setLocale('en');
	list();

	expect(usernamesOnScreen()).toEqual(['sami.staff', 'lina_h']);
	expect(document.querySelectorAll('[data-invitation]')).toHaveLength(2);

	for (const row of Array.from(document.querySelectorAll('[data-invitation]'))) {
		expect(row.querySelectorAll('[data-pending-username]')).toHaveLength(1);
		expect(row.textContent).not.toContain('@');
	}

	expect(screen.getByText(en.organization.dashboard.standingOpen)).toBeDefined();
	expect(screen.getByText(en.organization.dashboard.standingLapsed)).toBeDefined();
});

test('the revoke is offered on an unused account and calls back with the invitation', async () => {
	loadLocale('en');
	setLocale('en');

	const revoked: string[] = [];
	list({ onRevoke: (id) => revoked.push(id) });

	const revokes = screen.getAllByRole('button', { name: en.organization.dashboard.revoke });

	expect(revokes).toHaveLength(2);
	await fireEvent.click(revokes[0]!);
	expect(revoked).toEqual(['i-sami']);
});

test('with nothing pending the section says so', () => {
	loadLocale('en');
	setLocale('en');
	list({ members: [] });

	expect(screen.getByText(en.organization.dashboard.noPendingAccounts)).toBeDefined();
	expect(usernamesOnScreen()).toEqual([]);
});

test('and in arabic the rows read the same usernames under their own words', () => {
	loadLocale('ar');
	setLocale('ar');

	const rendered = list({}, 'rtl');

	expect(usernamesOnScreen()).toEqual(['sami.staff', 'lina_h']);
	expect(screen.getByText(ar.organization.dashboard.standingOpen)).toBeDefined();
	expect(screen.getByText(ar.organization.dashboard.standingLapsed)).toBeDefined();
	rendered.unmount();

	list({ members: [] }, 'rtl');

	expect(screen.getByText(ar.organization.dashboard.noPendingAccounts)).toBeDefined();
	expect(ar.organization.dashboard.noPendingAccounts).not.toBe(
		en.organization.dashboard.noPendingAccounts
	);

	setLocale('en');
});
