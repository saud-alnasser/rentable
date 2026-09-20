import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceMenu from '$lib/layout/component/workspace-menu.svelte';
import { fakeOrganizationWorkspace, fakeWorkspace } from '$lib/platform/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import RailProviders from './rail-providers.svelte';

/**
 * THE WORKSPACE MENU, RENDERED
 *
 * What the menu at the top of the rail puts in the document once it is open: the header naming
 * the workspace that is open, one row per workspace the member holds with the open one marked, a
 * choice of another handed back as that workspace's id, and one row to the workspaces section of
 * the settings area. That is the whole of it, which is criterion 9 of effort 828. And that a
 * switch redraws the menu rather than replacing it, which is effort 824's criterion 11 read at
 * the menu, since the sidebar has no test of its own.
 *
 * **Nothing here invites anybody and nothing here makes a workspace**, so no test hands the menu
 * a permission and none looks for a refusal sentence. Both acts left the menu on 2026-09-15 and
 * are covered where they live, in the members and workspaces sections of the settings area.
 *
 * The menu is dumb on purpose: props and a callback, no query and no client, so nothing here
 * provides one. It reaches nothing past its props now that the two dialogs are gone from it.
 */

const noop = () => {};

/**
 * Two browser facts the sidebar's state and the menu's floating content reach for, neither of
 * which jsdom carries: the shell breakpoint the design package's `tokens.css` declares, read
 * through `matchMedia`, and the `ResizeObserver` floating-ui measures an anchor with. The
 * package's own sidebar test stubs the same two, for the same reason.
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

const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });
const south = fakeOrganizationWorkspace({ id: 'south', name: 'South Properties' });

const menu = (overrides: Partial<Parameters<typeof render<typeof WorkspaceMenu>>[1]> = {}) => {
	loadLocale('en');
	setLocale('en');
	inAWideWindow();

	return render(
		WorkspaceMenu,
		{
			workspace: fakeWorkspace({ remoteId: 'north', name: 'North Properties' }),
			workspaces: [north, south],
			openId: 'north',
			memberCount: 3,
			onSwitch: noop,
			...overrides
		},
		{ wrapper: RailProviders, wrapperProps: { strings, direction: 'ltr' } }
	);
};

/** open the menu the way a pointer does, and answer with its rows. */
const open = async () => {
	await fireEvent.click(screen.getByRole('button', { expanded: false }));

	return screen.getAllByRole('menuitemradio');
};

const header = () => document.querySelector<HTMLElement>('[data-slot="dropdown-menu-label"]');
const workspacesRows = () => document.querySelectorAll('[data-workspace-menu-workspaces]');

test('the open menu is headed by the workspace this machine has open', async () => {
	menu();
	await open();

	expect(header()?.textContent).toContain('North Properties');
	// the second line says something true about the workspace rather than repeating its name.
	expect(header()?.textContent).toMatch(/3\s+member/);
});

test('the menu lists every workspace the member holds, with the open one marked', async () => {
	menu();

	const rows = await open();

	expect(rows.map((row) => row.querySelector('span.truncate')?.textContent)).toEqual([
		'North Properties',
		'South Properties'
	]);
	expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false']);
	// the marker's label is on the open row alone, for a reader who cannot see the glyph.
	expect(rows[0]?.textContent).toContain(en.layout.workspaceMenu.open);
	expect(rows[1]?.textContent).not.toContain(en.layout.workspaceMenu.open);
	expect(screen.getByText(en.layout.workspaceMenu.switchTo)).toBeDefined();
});

test('a member holding one workspace sees the one row, marked', async () => {
	menu({ workspaces: [north] });

	const rows = await open();

	expect(rows).toHaveLength(1);
	expect(rows[0]?.getAttribute('aria-checked')).toBe('true');
});

test('choosing another row hands back its id, and choosing the open one hands back nothing', async () => {
	const chosen: string[] = [];
	menu({ onSwitch: (id) => chosen.push(id) });

	// a choice closes the menu, as choosing from a menu does, so each is made from a fresh open.
	await fireEvent.click((await open())[1] as HTMLElement);
	expect(chosen).toEqual(['south']);

	await fireEvent.click((await open())[0] as HTMLElement);
	expect(chosen).toEqual(['south']);
});

// criterion 11 of effort 824: after a switch the menu is the same instance with new props, so the
// marker moves and no second menu is mounted.
test('a new open id redraws the menu rather than replacing it', async () => {
	const { rerender } = menu();

	const before = await open();
	expect(before.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false']);

	await rerender({
		workspace: fakeWorkspace({ remoteId: 'south', name: 'South Properties' }),
		openId: 'south'
	});

	expect(document.querySelectorAll('[data-workspace-menu]')).toHaveLength(1);
	expect(
		screen.getAllByRole('menuitemradio').map((row) => row.getAttribute('aria-checked'))
	).toEqual(['false', 'true']);
	// the header names the new workspace off the same record the marker reads.
	expect(screen.getByRole('button', { expanded: true }).textContent).toContain('South Properties');
});

// requirement 9 of effort 828: one row, and it is the only thing the menu offers besides the
// switch. The row opened the workspace page until 2026-09-14, which was one workspace; the
// section it opens now is the list of the ones this member holds.
test('one row leads to the settings area at the workspaces section', async () => {
	menu();
	await open();

	const rows = workspacesRows();

	expect(rows).toHaveLength(1);
	expect(rows[0]?.getAttribute('href')).toBe('/settings?section=workspaces');
	expect(rows[0]?.textContent).toContain(en.settings.section.workspaces);
	// nothing in the menu reaches the page the row used to open.
	expect(document.querySelector('a[href="/workspace"]')).toBeNull();
});

// requirement 9 of effort 828: the two acts that are not the workspace's left the switcher on
// 2026-09-15, and the sentence that refused most readers left with them. They are offered in the
// members and workspaces sections of the settings area, which is where their tests are.
test('nothing in the menu invites anybody or makes a workspace', async () => {
	menu();
	await open();

	expect(document.querySelector('[data-workspace-menu-invite]')).toBeNull();
	expect(document.querySelector('[data-workspace-menu-create]')).toBeNull();
	expect(document.querySelector('[data-workspace-menu-invite-refusal]')).toBeNull();
});
