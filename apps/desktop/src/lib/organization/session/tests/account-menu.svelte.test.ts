import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountMenu from '$lib/organization/session/component/account-menu.svelte';
import { fakeOrganizationSession } from '$lib/organization/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { listenForSignOut } from '$lib/sync';

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
 * And its rows, once it is open (effort 851, at the human's word on 2026-10-06): the settings area,
 * then its account, organization and workspaces sections, each opening the area on that section,
 * then the way out, which asks nothing. *Effort 826 had taken the section rows out; the human asked
 * for them back.*
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
 * the span a row draws its label in, found by the label, since the rows carry different marks and
 * the casing is a claim about all of them.
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

test('the menu offers settings, its three sections, and the way out, in that order', async () => {
	menu('ada.lovelace');
	await open();

	expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
		en.common.nav.settings,
		en.settings.section.account,
		en.settings.section.organization,
		en.settings.section.workspaces,
		en.common.actions.signOut
	]);
});

test('settings opens the settings area at its front', async () => {
	menu('ada.lovelace');
	await open();

	expect(row('settings')?.getAttribute('href')).toBe('/settings');
	// the two pages the menu used to reach are gone with requirement 14's one area.
	expect(document.querySelector('a[href="/organization"]')).toBeNull();
	expect(document.querySelector('a[href="/account"]')).toBeNull();
});

test('account, organization and workspaces each open the settings area on that section', async () => {
	menu('ada.lovelace');
	await open();

	for (const section of ['account', 'organization', 'workspaces']) {
		const entry = document.querySelector<HTMLElement>(`[data-account-menu-section=${section}]`);

		expect(entry?.getAttribute('href'), section).toBe(`/settings?section=${section}`);
		// each wears its section's glyph, as the section switch draws it.
		expect(entry?.querySelector('svg'), section).not.toBeNull();
	}
});

test('the way out stands apart from the places, after a separator', async () => {
	menu('ada.lovelace');
	await open();

	const content = document.querySelector<HTMLElement>('[data-slot=dropdown-menu-content]')!;
	const children = [...content.children];
	const signOut = children.findIndex((child) => child.hasAttribute('data-account-menu-sign-out'));

	expect(signOut).toBeGreaterThan(0);
	expect(children[signOut - 1]?.getAttribute('data-slot')).toBe('dropdown-menu-separator');
});

test('the way out is cased like the settings row beside it', async () => {
	menu('ada.lovelace');
	await open();

	const settings = label(en.common.nav.settings);

	expect(settings?.className).toContain('capitalize');
	expect(label(en.common.actions.signOut)?.className).toBe(settings?.className);
});

// effort 851, at the human's word on 2026-10-06: "sign out is simple, just sign out". Choosing the
// way out asks nothing and asks the shell at once, which puts the wall up in place.
test('the way out asks no question and asks the shell to sign out at once', async () => {
	menu('ada.lovelace');
	await open();

	let asked = 0;
	const stop = listenForSignOut(() => {
		asked += 1;
	});

	await fireEvent.click(screen.getByRole('menuitem', { name: en.common.actions.signOut }));

	await waitFor(() => expect(asked).toBe(1));
	expect(document.querySelector('[data-confirm-dialog]')).toBeNull();
	stop();
});
