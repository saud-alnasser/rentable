import { DesignProvider } from '@rentable/design/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Identity from '$lib/organization/session/component/identity.svelte';
import { fakeOrganizationSession } from '$lib/organization/tests/testing.ts';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { accountInitials } from '$lib/sync';

/**
 * THE IDENTITY BLOCK, RENDERED
 *
 * Requirement 21 of the redesign: the block on the account page names the person by the one
 * username, with no address and no display name beside it; the role and the organization are
 * the two facts drawn beside it. Since effort 846 it is a settings card drawn as its header
 * alone: the avatar, the username as its title, the organization as its line and the role as a
 * badge at its end; and the way out is not in it: signing out is the account section's last card
 * (requirement 8 of that effort). Both locales.
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
	const header = identity.querySelector('[data-settings-group-header]')!;

	// a header, not a row: the person leads, larger than a setting, by their avatar.
	expect(screen.getByRole('region', { name: 'sami.staff' })).toBeDefined();
	expect(identity.querySelectorAll('[data-settings-row]')).toHaveLength(0);
	expect(header.querySelector('h2')?.textContent?.trim()).toBe('sami.staff');
	expect(header.querySelector('[data-slot=avatar]')?.textContent?.trim()).toBe(
		accountInitials('sami.staff')
	);
	expect(header.querySelector('[data-settings-group-description]')?.textContent?.trim()).toBe(
		'Acme Rentals'
	);
	expect(
		header.querySelector('[data-settings-group-value] [data-slot=badge]')?.textContent?.trim()
	).toBe(en.layout.signIn.roleManager);
	expect(identity.textContent).not.toContain('@');
	// the way out is the section's last group, not a button beside the name.
	expect(screen.queryByRole('button')).toBeNull();
});

test('and in arabic, the same username under the role in its own words', () => {
	loadLocale('ar');
	setLocale('ar');
	block('lina_h', 'rtl');

	expect(document.querySelector('[data-identity] h2')?.textContent?.trim()).toBe('lina_h');
	expect(screen.getByText(ar.layout.signIn.roleManager)).toBeDefined();
	expect(screen.getByRole('region', { name: 'lina_h' })).toBeDefined();

	setLocale('en');
});
