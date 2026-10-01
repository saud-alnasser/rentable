import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceMenu from '$lib/workspace/component/menu.svelte';
import { fakeOrganizationWorkspace } from '$lib/organization/tests/testing.ts';
import { fakeWorkspace } from '$lib/sync/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import RailProviders from '$lib/shell/tests/rail-providers.svelte';

/**
 * THE WORKSPACE MENU, RENDERED
 *
 * What the control at the top of the rail puts in the document: a trigger naming the workspace
 * that is open and nothing else, and once it is open, one row per workspace the member holds with
 * the open one checked, a separator, and "manage workspaces…" to the workspaces section of the
 * settings area. That is the whole of it, which is criteria 10 and 11 of effort 843. It is driven
 * from the keyboard as a menu is, which is that effort's criterion 13. A choice of another row is
 * handed back as that workspace's id, and a switch redraws the menu rather than replacing it,
 * which is effort 824's criterion 11 read at the menu, since the sidebar has no test of its own.
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

const trigger = () => document.querySelector<HTMLElement>('[data-sidebar="menu-button"]')!;
const manageRows = () => document.querySelectorAll('[data-workspace-menu-manage]');

/**
 * the open menu's rows and separators, in document order, each read as what it is: a workspace
 * row by the name it shows, a separator as `|`, and the manage row as `manage`.
 */
const outline = () =>
	[
		...document.querySelectorAll(
			'[role="menu"] [role="menuitemradio"], [role="menu"] [data-slot="dropdown-menu-separator"], [role="menu"] [data-workspace-menu-manage]'
		)
	].map((node) => {
		if (node.getAttribute('role') === 'menuitemradio') {
			const name = node.querySelector('span.truncate')?.textContent;

			return node.getAttribute('aria-checked') === 'true' ? `${name} (checked)` : `${name}`;
		}

		return node.matches("[data-slot='dropdown-menu-separator']") ? '|' : 'manage';
	});

// criterion 10 of effort 843: the trigger names where you are. The member count it carried on a
// second line is gone, and so is anything else that would repeat what the menu holds.
test('the trigger names the open workspace and nothing else', () => {
	menu();

	expect(trigger().textContent?.trim()).toBe('North Properties');
});

// criterion 11 of effort 843: the held workspaces with the open one checked, a separator, then
// the manage command, and no header or heading above them.
test('the menu is the held workspaces with the open one checked, a separator, and manage', async () => {
	menu();

	const rows = await open();

	expect(outline()).toEqual(['North Properties (checked)', 'South Properties', '|', 'manage']);
	expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false']);
	// the check is drawn at the start of the open row alone.
	expect(rows[0]?.querySelector('.lucide-check')).not.toBeNull();
	expect(rows[1]?.querySelector('svg')).toBeNull();
	// the marker's label is on the open row alone, for a reader who cannot see the glyph.
	expect(rows[0]?.textContent).toContain(en.layout.workspaceMenu.open);
	expect(rows[1]?.textContent).not.toContain(en.layout.workspaceMenu.open);
	// the header that repeated the trigger and the "switch to" heading are gone.
	expect(document.querySelector('[data-slot="dropdown-menu-label"]')).toBeNull();
	expect(document.querySelector('[data-slot="dropdown-menu-group-heading"]')).toBeNull();
});

test('a member holding one workspace sees it checked, and the manage command', async () => {
	menu({ workspaces: [north] });

	const rows = await open();

	expect(rows).toHaveLength(1);
	expect(rows[0]?.getAttribute('aria-checked')).toBe('true');
	expect(outline()).toEqual(['North Properties (checked)', '|', 'manage']);
});

// criterion 13 of effort 843: the control opens from the keyboard, the arrows move through the
// rows, and Escape closes it and hands focus back to the trigger it opened from.
test('the keyboard opens the menu, moves through it, and closes it back onto the trigger', async () => {
	menu();

	trigger().focus();
	expect(document.activeElement).toBe(trigger());

	await fireEvent.keyDown(trigger(), { key: 'Enter' });
	await waitFor(() => expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull());

	const rows = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
	expect(rows).toHaveLength(2);
	const highlighted = () => document.querySelector<HTMLElement>('[role="menu"] [data-highlighted]');

	await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
	await waitFor(() => expect(highlighted()).not.toBeNull());
	const first = highlighted();
	expect(rows).toContain(first);

	await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
	await waitFor(() => expect(highlighted()).not.toBe(first));

	await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
	await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(trigger()));
});

// criterion 13 of effort 843 names Enter or Space, and the test above presses Enter. Space opens
// the same menu, with the open workspace announced as the checked row, and Escape hands focus
// back to the trigger.
test('Space opens the menu with the open workspace checked, and Escape closes it back onto the trigger', async () => {
	menu();

	trigger().focus();
	expect(document.activeElement).toBe(trigger());

	await fireEvent.keyDown(trigger(), { key: ' ', code: 'Space' });
	await waitFor(() => expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull());

	const checked = document.querySelectorAll<HTMLElement>(
		'[role="menu"] [role="menuitemradio"][aria-checked="true"]'
	);
	expect(checked).toHaveLength(1);
	expect(checked[0]?.querySelector('span.truncate')?.textContent).toBe('North Properties');

	await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
	await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(trigger()));
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
	// the trigger names the new workspace off the same record the check reads.
	expect(screen.getByRole('button', { expanded: true }).textContent).toContain('South Properties');
});

// requirement 9 of effort 828, with effort 843's words: one row, and it is the only thing the
// menu offers besides the switch. It leads where the "workspaces" row did, and says "manage
// workspaces…" with the ellipsis, because it opens more.
test('manage workspaces leads to the settings area at the workspaces section', async () => {
	menu();
	await open();

	const rows = manageRows();

	expect(rows).toHaveLength(1);
	expect(rows[0]?.getAttribute('href')).toBe('/settings?section=workspaces');
	expect(rows[0]?.textContent).toContain(en.layout.workspaceMenu.manage);
	expect(en.layout.workspaceMenu.manage).toBe('manage workspaces…');
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
