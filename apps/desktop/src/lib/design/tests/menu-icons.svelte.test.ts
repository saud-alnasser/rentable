import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import AccountMenu from '$lib/layout/component/account-menu.svelte';
import AccountSignedOut from '$lib/layout/component/account-signed-out.svelte';
import WorkspaceMenu from '$lib/layout/component/workspace-menu.svelte';
import RailProviders from '$lib/layout/tests/rail-providers.svelte';
import {
	fakeOrganizationSession,
	fakeOrganizationWorkspace,
	fakeWorkspace
} from '$lib/platform/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import ListHarness from './list-harness.svelte';

/**
 * THE SHARED MENUS CARRY ICONS ON EVERY ROW OR ON NONE
 *
 * Requirement 3 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], criterion
 * 3(b): no menu mixes rows that lead with a glyph and rows that do not. A menu that does reads as
 * two lists run together, and the rows without one look indented by mistake.
 *
 * **What counts as leading with a glyph** is read off the row rather than off the source: its
 * first element is an `svg`. A radio or checkbox row counts as leading with one, because the
 * primitive reserves the indicator's column at the row's start whether or not it is checked, so
 * it lines up with a glyph above or below it. A glyph that trails the label (the check on a
 * chosen filter value, the direction on a chosen sort) is a state, not the row's icon, and does
 * not count.
 *
 * The menus here are the ones more than one screen opens: the list toolbar's three, and the
 * rail's account and workspace menus. The record card's two routes are the design package's,
 * and its own test covers them there.
 */

const leadsWithGlyph = (row: Element) =>
	row.getAttribute('role') !== 'menuitem' || row.firstElementChild?.tagName.toLowerCase() === 'svg';

/** the rows of the one menu open now, each read as leading with a glyph or not. */
const rowsOfTheOpenMenu = () => {
	const menu = document.querySelector('[role="menu"]');

	expect(menu).not.toBeNull();

	return [...menu!.querySelectorAll('[role^="menuitem"]')].map(leadsWithGlyph);
};

/** the assertion itself: at least one row, and every row answering the same way. */
const expectAllOrNone = (rows: boolean[]) => {
	expect(rows.length).toBeGreaterThan(0);
	expect(new Set(rows).size, `rows leading with a glyph: ${rows.join(', ')}`).toBe(1);
};

/**
 * Two browser facts the sidebar's state and the menus' floating content reach for, neither of
 * which jsdom carries. The rail's own tests stub the same two, for the same reason.
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

function inEnglish() {
	loadLocale('en');
	setLocale('en');
	inAWideWindow();
}

const rail = { wrapper: RailProviders, wrapperProps: { strings, direction: 'ltr' as const } };

test("the list's filter menu: its values and the row that clears them", async () => {
	inEnglish();
	render(ListHarness);

	await fireEvent.click(screen.getByRole('button', { name: 'status: open' }));

	const rows = rowsOfTheOpenMenu();

	// the two values and the clear row, so the case the rule is about is present.
	expect(rows).toHaveLength(3);
	expectAllOrNone(rows);
});

test("the list's sort menu", async () => {
	inEnglish();
	render(ListHarness);

	await fireEvent.click(screen.getByRole('button', { name: `${en.common.actions.sortBy}: name` }));

	expectAllOrNone(rowsOfTheOpenMenu());
});

test("the list's transfer menu", async () => {
	inEnglish();
	render(ListHarness);

	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.transferData }));

	expectAllOrNone(rowsOfTheOpenMenu());
});

test('the account menu, signed in', async () => {
	inEnglish();
	render(AccountMenu, { session: fakeOrganizationSession({ username: 'ada.lovelace' }) }, rail);

	await fireEvent.click(screen.getByRole('button', { expanded: false }));

	expectAllOrNone(rowsOfTheOpenMenu());
});

test('the account menu, signed out', async () => {
	inEnglish();
	render(AccountSignedOut, { onWayIn: () => {} }, rail);

	await fireEvent.click(screen.getByRole('button', { expanded: false }));

	expectAllOrNone(rowsOfTheOpenMenu());
});

test('the workspace menu, whose switch rows are radio rows', async () => {
	inEnglish();
	render(
		WorkspaceMenu,
		{
			workspace: fakeWorkspace({ remoteId: 'north', name: 'North Properties' }),
			workspaces: [
				fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' }),
				fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' })
			],
			openId: 'north',
			memberCount: 3,
			onSwitch: () => {}
		},
		rail
	);

	await fireEvent.click(screen.getByRole('button', { expanded: false }));

	expectAllOrNone(rowsOfTheOpenMenu());
});
