import type { DesignStrings } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceMenu from '$lib/layout/component/workspace-menu.svelte';
import { fakeOrganizationWorkspace, fakeWorkspace } from '$lib/platform/tests/testing.ts';

import RailProviders from './rail-providers.svelte';

/**
 * THE WORKSPACE MENU, RENDERED
 *
 * What the menu at the top of the rail puts in the document once it is open: one row per
 * workspace the member holds, the open one marked, and a choice of another handed back as that
 * workspace's id. And that a switch redraws the menu rather than replacing it, which is the
 * spec's criterion 11 read at the menu, since the sidebar has no test of its own.
 *
 * The menu is dumb on purpose: props and a callback, no query and no client, so nothing here
 * provides one.
 */

const noop = () => {};

/**
 * the design primitives read the provider; every string they could ask for comes back as its
 * own name in braces, which no assertion below looks for.
 */
const strings = new Proxy({} as DesignStrings, {
	get: (_, key) => (key === 'moreRecords' ? (count: number) => `{${count}}` : `{${String(key)}}`)
});

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

// criterion 11: after a switch the menu is the same instance with new props, so the marker
// moves and no second menu is mounted.
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
