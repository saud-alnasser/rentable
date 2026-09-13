import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountMenu from '$lib/layout/component/account-menu.svelte';
import { fakeOrganizationSession } from '$lib/platform/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import RailProviders from './rail-providers.svelte';

/**
 * THE ACCOUNT CONTROL, RENDERED
 *
 * What the control at the foot of the rail puts in the document before it is opened: the
 * username, and beside it the avatar's fallback text, which is the first two characters of that
 * username upper-cased (requirement 24). The sidebar has no test of its own, so this is where
 * the spec's criterion 24 is read for the rail; the members list's rows are read in
 * `organization/tests/members.svelte.test.ts`.
 *
 * The control is props and a session, no query and no client, so nothing here provides one.
 */

/**
 * Two browser facts the sidebar's state reaches for, neither of which jsdom carries: the shell
 * breakpoint the design package's `tokens.css` declares, read through `matchMedia`, and the
 * `ResizeObserver` floating-ui measures an anchor with. `workspace-menu.svelte.test.ts` stubs
 * the same two, for the same reason.
 */
function inAWideWindow() {
	document.documentElement.style.setProperty('--breakpoint-shell', '48rem');

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
}

const menu = (username: string) => {
	loadLocale('en');
	setLocale('en');
	inAWideWindow();

	return render(
		AccountMenu,
		{ session: fakeOrganizationSession({ username }) },
		{ wrapper: RailProviders, wrapperProps: { strings, direction: 'ltr' } }
	);
};

const avatarText = () =>
	document.querySelector('[data-slot="avatar-fallback"]')?.textContent?.trim();

test('the avatar shows the first two characters of the username, upper-cased', () => {
	menu('olivia.owner');

	expect(avatarText()).toBe('OL');
});

test('the control names the username beside the avatar', () => {
	menu('ada.lovelace');

	expect(avatarText()).toBe('AD');
	expect(screen.getByRole('button', { expanded: false }).textContent).toContain('ada.lovelace');
	expect(screen.getByRole('button', { expanded: false }).textContent).not.toContain('Acme Rentals');
});
