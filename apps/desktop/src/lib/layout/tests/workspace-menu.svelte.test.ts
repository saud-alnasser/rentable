import type { DesignStrings } from '@rentable/design/strings.js';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import WorkspaceMenu from '$lib/layout/component/workspace-menu.svelte';
import { organizationDialog, resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
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
 * And its two actions (criterion 10 and criterion 12): each opens its dialog for whoever the
 * row's permission admits, and for everybody else is drawn refused with the sentence the sidebar
 * composed, never with a padlock. The menu draws and never decides, so the sentences here are
 * whatever a caller hands in; the locale's are used so the test reads as the screen does.
 *
 * The menu is dumb on purpose: props and a callback, no query and no client, so nothing here
 * provides one. The one thing it reaches past its props is the dialog request in
 * `organization/dialogs.svelte.ts`, which is what the opener tests read.
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
			canInvite: true,
			canCreateWorkspace: true,
			refusal: { invite: null, workspace: null },
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

const inviteRow = () => document.querySelector<HTMLElement>('[data-workspace-menu-invite]');
const createRow = () => document.querySelector<HTMLElement>('[data-workspace-menu-create]');

beforeEach(() => {
	resetOrganizationDialogs();
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

// criterion 10 and criterion 12: the invite row opens the invite dialog for whoever the session
// admits.
test('the invite row opens the invite dialog for whoever may invite', async () => {
	menu({ canInvite: true });
	await open();

	const row = inviteRow();

	expect(row?.getAttribute('aria-disabled')).not.toBe('true');
	expect(document.querySelector('[data-workspace-menu-invite-refusal]')).toBeNull();
	expect(organizationDialog.open).toBeNull();

	await fireEvent.click(row as HTMLElement);

	expect(organizationDialog.open).toBe('invite');
});

test('for everybody else the invite row is refused with the sentence it was handed, and no padlock', async () => {
	menu({
		canInvite: false,
		refusal: { invite: en.layout.workspaceMenu.inviteRefused, workspace: null }
	});
	await open();

	const row = inviteRow();

	expect(row?.getAttribute('aria-disabled')).toBe('true');
	// the sentence is on screen, and the row names it for a reader who cannot see the layout.
	expect(screen.getByText(en.layout.workspaceMenu.inviteRefused)).toBeDefined();
	expect(
		document.getElementById(row?.getAttribute('aria-describedby') ?? '')?.textContent?.trim()
	).toBe(en.layout.workspaceMenu.inviteRefused);
	expect(document.querySelector('svg.lucide-lock')).toBeNull();

	await fireEvent.click(row as HTMLElement);

	expect(organizationDialog.open).toBeNull();
});

test('the new-workspace row opens the workspace dialog for an owner holding the authority', async () => {
	menu({ canCreateWorkspace: true });
	await open();

	const row = createRow();

	expect(row?.getAttribute('aria-disabled')).not.toBe('true');
	expect(document.querySelector('[data-workspace-menu-create-refusal]')).toBeNull();

	await fireEvent.click(row as HTMLElement);

	expect(organizationDialog.open).toBe('workspace');
});

test('for a member who is not the owner the new-workspace row says whose act it is', async () => {
	menu({
		canCreateWorkspace: false,
		refusal: { invite: null, workspace: en.layout.workspaceMenu.workspaceRefusedOwner }
	});
	await open();

	const row = createRow();

	expect(row?.getAttribute('aria-disabled')).toBe('true');
	expect(row?.textContent).toContain(en.layout.workspaceMenu.workspaceRefusedOwner);
	expect(document.querySelector('svg.lucide-lock')).toBeNull();

	await fireEvent.click(row as HTMLElement);

	expect(organizationDialog.open).toBeNull();
});

test('for an owner whose machine holds no authority the new-workspace row says what to do first', async () => {
	menu({
		canCreateWorkspace: false,
		refusal: { invite: null, workspace: en.layout.workspaceMenu.workspaceRefusedAuthority }
	});
	await open();

	const row = createRow();

	expect(row?.getAttribute('aria-disabled')).toBe('true');
	expect(row?.textContent).toContain(en.layout.workspaceMenu.workspaceRefusedAuthority);
	expect(row?.textContent).not.toContain(en.layout.workspaceMenu.workspaceRefusedOwner);
});
