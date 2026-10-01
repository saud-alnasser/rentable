import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountMenu from '$lib/organization/session/component/account-menu.svelte';
import { fakeOrganizationSession } from '$lib/organization/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import RailProviders from '$lib/shell/tests/rail-providers.svelte';

/**
 * THE ACCOUNT CONTROL, RENDERED
 *
 * What the control at the foot of the rail puts in the document before it is opened: the
 * username, and beside it the avatar's fallback text, which is the first two characters of that
 * username upper-cased (requirement 24). The sidebar has no test of its own, so this is where
 * the spec's criterion 24 is read for the rail; the members list's rows are read in
 * `organization/member/tests/directory.svelte.test.ts`.
 *
 * And its two rows, once it is open (requirement 17 of effort 826, as corrected on the human's
 * first run): the settings area, and the way out. The organization row and the account row went
 * with the pages they opened, and the row for the person followed them, because the `you` section
 * is reached from the settings rail, the palette and the address without it.
 *
 * The control is props and a session, no query and no client, so nothing here provides one.
 *
 * The casing of its rows is one claim (requirement 10), measured against the settings row it
 * already draws capitalized. It had a signed-out half until effort 843 took the rail off the way
 * in.
 */

/**
 * Two browser facts the sidebar's state reaches for, neither of which jsdom carries: the shell
 * breakpoint the design package's `tokens.css` declares, read through `matchMedia`, and the
 * `ResizeObserver` floating-ui measures an anchor with. `workspace/tests/menu.svelte.test.ts` stubs
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

/** open the menu the way a pointer does. */
const open = async () => {
	await fireEvent.click(screen.getByRole('button', { expanded: false }));
};

const row = (mark: string) => document.querySelector<HTMLElement>(`[data-account-menu-${mark}]`);

/**
 * the span a row draws its label in, found by the label, since only the settings row carries a
 * mark of its own and the casing is a claim about all of them.
 */
const label = (text: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"] span')].find(
		(span) => span.textContent?.trim() === text
	);

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

test('the menu offers settings and the way out, in that order, and nothing else', async () => {
	menu('ada.lovelace');
	await open();

	expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
		en.common.nav.settings,
		en.common.actions.signOut
	]);
});

test('no row names the section about the person', async () => {
	menu('ada.lovelace');
	await open();

	expect(row('you')).toBeNull();
	expect(row('account')).toBeNull();
	// the section it named is called account since requirement 24 of effort 828, and neither word
	// is a row here.
	expect(document.querySelector('a[href="/settings?section=you"]')).toBeNull();
	expect(document.querySelector('a[href="/settings?section=account"]')).toBeNull();
	expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).not.toContain(
		en.settings.section.account
	);
});

test('settings opens the settings area at its front', async () => {
	menu('ada.lovelace');
	await open();

	expect(row('settings')?.getAttribute('href')).toBe('/settings');
	// the two pages the menu used to reach are gone with requirement 14's one area.
	expect(document.querySelector('a[href="/organization"]')).toBeNull();
	expect(document.querySelector('a[href="/account"]')).toBeNull();
});

test('the way out is cased like the settings row beside it', async () => {
	menu('ada.lovelace');
	await open();

	const settings = label(en.common.nav.settings);

	expect(settings?.className).toContain('capitalize');
	expect(label(en.common.actions.signOut)?.className).toBe(settings?.className);
});
