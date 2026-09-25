import { DesignProvider } from '@rentable/design/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Identity from '$lib/organization/component/identity.svelte';
import { fakeOrganizationSession } from '$lib/platform/tests/testing.ts';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE IDENTITY BLOCK, RENDERED
 *
 * Requirement 21 of the redesign: the block on the account page names the person by the one
 * username, with no address and no display name beside it; the role and the organization are
 * the two facts drawn under it, and the avatar is the first two characters of the username
 * upper-cased, as the rail's and the members list's are (requirement 24). Both locales.
 *
 * The block is props and a session, no query and no client, so nothing here provides one.
 */

const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const block = (username: string, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		Identity,
		{ session: fakeOrganizationSession({ username, role: 'manager' }) },
		inProvider(direction)
	);

test('the block names the person by the username, the role and the organization, and nothing else', () => {
	loadLocale('en');
	setLocale('en');
	block('sami.staff');

	const identity = document.querySelector('[data-identity]')!;

	expect(identity.querySelector('[data-identity-username]')?.textContent?.trim()).toBe(
		'sami.staff'
	);
	expect(screen.getByText(en.layout.signIn.roleAdministrator)).toBeDefined();
	expect(screen.getByText('Acme Rentals')).toBeDefined();
	expect(identity.textContent).not.toContain('@');
	expect(identity.querySelectorAll('[data-identity-username]')).toHaveLength(1);
	expect(document.querySelector('[data-slot="avatar-fallback"]')?.textContent?.trim()).toBe('SA');
	expect(screen.getByRole('button', { name: en.common.actions.signOut })).toBeDefined();
});

test('and in arabic, the same username under the role in its own words', () => {
	loadLocale('ar');
	setLocale('ar');
	block('lina_h', 'rtl');

	expect(document.querySelector('[data-identity-username]')?.textContent?.trim()).toBe('lina_h');
	expect(screen.getByText(ar.layout.signIn.roleAdministrator)).toBeDefined();
	expect(document.querySelector('[data-slot="avatar-fallback"]')?.textContent?.trim()).toBe('LI');
	expect(screen.getByRole('button', { name: ar.common.actions.signOut })).toBeDefined();

	setLocale('en');
});
