import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeAll, beforeEach, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Switcher from '$lib/organization/component/switcher.svelte';
import { fakeHeldOrganization } from '$lib/organization/tests/testing.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import Providers from '#tests/providers.svelte';

/**
 * THE ORGANIZATION SWITCHER, RENDERED
 *
 * Criterion 3 of effort 851, and the component half of criteria 5 and 6: the trigger names the
 * chosen organization and opens on a click; the menu lists every held organization with the chosen
 * one checked and an x on each row, then "add organization" with a plus, last; a row's x opens the
 * remove confirm for that row's organization and does not choose it; the confirm's line says the
 * Turso account goes only where this machine holds that organization's consent; leaving the
 * confirm removes nothing; and a busy screen leaves the switcher shut.
 *
 * The switcher draws and never decides, so what a choice, an add or a remove does is the caller's
 * and each is read here as the id it hands back. The wall's own tests carry what follows a choice
 * (`startup/tests/sign-in.svelte.test.ts`).
 */

beforeAll(() => {
	loadLocale('en');
	loadLocale('ar');
	// floating-ui measures the anchor with a `ResizeObserver`, which jsdom has none of.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

beforeEach(() => {
	setLocale('en');
	document.body.innerHTML = '';
});

const acme = fakeHeldOrganization({ id: 'acme', name: 'Acme Rentals', holdsTursoAuthority: true });
const beta = fakeHeldOrganization({
	id: 'beta',
	name: 'Beta Lettings',
	memberId: 'member-2',
	role: 'member',
	holdsTursoAuthority: false
});

type Asked = { selected: string[]; removed: string[]; added: number };

const draw = (props: Partial<Parameters<typeof render<typeof Switcher>>[1]> = {}) => {
	const asked: Asked = { selected: [], removed: [], added: 0 };

	render(
		Switcher,
		{
			organizations: [acme, beta],
			selected: 'acme',
			onSelect: (id: string) => void asked.selected.push(id),
			onAdd: () => void asked.added++,
			onRemove: (id: string) => void asked.removed.push(id),
			...props
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	return asked;
};

const trigger = () => document.querySelector<HTMLButtonElement>('[data-organization-switcher]')!;

/** open the menu the way a pointer does, and answer with its rows. */
const open = async () => {
	await fireEvent.click(trigger());
	await tick();

	return screen.getAllByRole('menuitemradio');
};

/**
 * the open menu in document order: a row by its name, checked or not and with its x or not, a
 * separator as `|`, and the add as `add`.
 */
const outline = () =>
	[
		...document.querySelectorAll(
			'[role="menu"] [role="menuitemradio"], [role="menu"] [data-slot="dropdown-menu-separator"], [role="menu"] [data-organization-switcher-add]'
		)
	].map((node) => {
		if (node.getAttribute('role') === 'menuitemradio') {
			const name = node.querySelector('span.truncate')?.textContent;
			const x = node.querySelector('[data-organization-switcher-remove]') ? ' x' : '';

			return `${name}${node.getAttribute('aria-checked') === 'true' ? ' (checked)' : ''}${x}`;
		}

		return node.matches("[data-slot='dropdown-menu-separator']") ? '|' : 'add';
	});

const dialog = () => document.querySelector('[data-slot="dialog-content"]');

const dialogButton = (label: string) =>
	Array.from(
		document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button')
	).find((button) => button.textContent?.trim() === label);

test('the trigger names the chosen organization with its tile, and the menu is closed', () => {
	draw();

	expect(trigger().textContent?.replace(/\s+/g, ' ').trim()).toBe('A Acme Rentals');
	expect(trigger().querySelector('[data-organization-tile]')?.textContent?.trim()).toBe('A');
	expect(trigger().getAttribute('aria-expanded')).toBe('false');
	// the outline button answers a hover with its fill (the human's "shown when hovered").
	expect(trigger().className).toContain('hover:bg-accent');
	expect(document.querySelector('[role="menu"]')).toBeNull();
	expect(screen.queryByText('Beta Lettings')).toBeNull();
});

test('a click opens every held organization, the chosen one checked, each with an x, then add last', async () => {
	draw();

	const rows = await open();

	expect(outline()).toEqual(['Acme Rentals (checked) x', 'Beta Lettings x', '|', 'add']);
	expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false']);
	expect(rows[0]?.querySelector('.lucide-check')).not.toBeNull();
	expect(rows[1]?.querySelector('.lucide-check')).toBeNull();
	expect(rows[0]?.textContent).toContain(en.organization.switcher.chosen);
	expect(rows[1]?.textContent).not.toContain(en.organization.switcher.chosen);
	// every row carries its tile, and its x is named for what it removes.
	expect(
		rows.map((row) => row.querySelector('[data-organization-tile]')?.textContent?.trim())
	).toEqual(['A', 'B']);
	expect(
		rows.map((row) =>
			row.querySelector('[data-organization-switcher-remove]')?.getAttribute('aria-label')
		)
	).toEqual(['remove Acme Rentals', 'remove Beta Lettings']);

	const add = document.querySelector('[data-organization-switcher-add]');

	expect(add?.textContent?.trim()).toBe(en.organization.switcher.add);
	expect(add?.querySelector('.lucide-plus')).not.toBeNull();
});

test('choosing the other hands back its id, and choosing the chosen one hands back nothing', async () => {
	const asked = draw();

	await open();
	await fireEvent.click(screen.getByRole('menuitemradio', { name: /Beta Lettings/ }));

	expect(asked.selected).toEqual(['beta']);

	await open();
	await fireEvent.click(screen.getByRole('menuitemradio', { name: /Acme Rentals/ }));

	expect(asked.selected).toEqual(['beta']);
});

test('"add organization" hands back the add', async () => {
	const asked = draw();

	await open();
	await fireEvent.click(document.querySelector<HTMLElement>('[data-organization-switcher-add]')!);

	expect(asked.added).toBe(1);
	expect(asked.selected).toEqual([]);
});

// criterion 3: the x opens the confirm for that row's organization and does not switch to it.
test("a row's x opens the remove confirm for that organization, and does not choose it", async () => {
	const asked = draw();

	await open();

	const x = document.querySelector<HTMLElement>('[data-organization-switcher-remove="beta"]')!;

	await fireEvent.pointerDown(x);
	await fireEvent.pointerUp(x);
	await fireEvent.click(x);
	await tick();

	expect(asked.selected).toEqual([]);
	await waitFor(() => expect(dialog()).not.toBeNull());
	expect(document.querySelector('[role="menu"]')).toBeNull();
	expect(dialog()?.textContent).toContain('Beta Lettings');
	expect(dialog()?.textContent).not.toContain('Acme Rentals');
	// nothing ran on opening the question.
	expect(asked.removed).toEqual([]);
});

// criterion 5, the component half: confirming removes that one; the Turso clause is said only
// where this machine holds that organization's consent.
test('confirming removes that organization, and its line names the Turso account only where it is held', async () => {
	const asked = draw();

	await open();
	await fireEvent.click(
		document.querySelector<HTMLElement>('[data-organization-switcher-remove="beta"]')!
	);
	await waitFor(() => expect(dialog()).not.toBeNull());

	expect(dialog()?.textContent).toContain(en.layout.signIn.disconnectDescriptionNoTurso);
	expect(dialog()?.textContent).not.toContain(en.layout.signIn.disconnectDescription);

	await fireEvent.click(dialogButton(en.layout.signIn.disconnect)!);
	await waitFor(() => expect(asked.removed).toEqual(['beta']));
	expect(asked.selected).toEqual([]);

	// the chosen organization's consent is held here, and its confirm says the account goes.
	await waitFor(() => expect(dialog()).toBeNull());
	await open();
	await fireEvent.click(
		document.querySelector<HTMLElement>('[data-organization-switcher-remove="acme"]')!
	);
	await waitFor(() => expect(dialog()).not.toBeNull());

	expect(dialog()?.textContent).toContain('Acme Rentals');
	expect(dialog()?.textContent).toContain(en.layout.signIn.disconnectDescription);
});

test('leaving the confirm removes nothing and chooses nothing', async () => {
	const asked = draw();

	await open();
	await fireEvent.click(
		document.querySelector<HTMLElement>('[data-organization-switcher-remove="acme"]')!
	);
	await waitFor(() => expect(dialog()).not.toBeNull());

	const leave = Array.from(
		document.querySelectorAll<HTMLButtonElement>('[data-slot="dialog-footer"] button')
	).find((button) => button.textContent?.trim() !== en.layout.signIn.disconnect);

	await fireEvent.click(leave!);
	await tick();

	expect(asked.removed).toEqual([]);
	expect(asked.selected).toEqual([]);
});

test('a row reached by the keyboard answers Delete with the same confirm', async () => {
	const asked = draw();

	await open();

	const row = screen.getByRole('menuitemradio', { name: /Beta Lettings/ });

	await fireEvent.keyDown(row, { key: 'Delete' });
	await waitFor(() => expect(dialog()).not.toBeNull());

	expect(dialog()?.textContent).toContain('Beta Lettings');
	expect(asked.selected).toEqual([]);
});

// criterion 6, the component half: a busy screen leaves the switcher shut.
test('disabled, the trigger is drawn disabled and a click opens nothing', async () => {
	draw({ disabled: true });

	expect(trigger().disabled).toBe(true);

	await fireEvent.click(trigger());
	await tick();

	expect(document.querySelector('[role="menu"]')).toBeNull();
});

test('in arabic, the add and the x are said in arabic', async () => {
	setLocale('ar');
	draw();

	await open();

	expect(document.querySelector('[data-organization-switcher-add]')?.textContent?.trim()).toBe(
		ar.organization.switcher.add
	);
	expect(
		document.querySelector('[data-organization-switcher-remove="beta"]')?.getAttribute('aria-label')
	).toBe(ar.organization.switcher.remove.replace('{name}', 'Beta Lettings'));
	expect(ar.organization.switcher.add).not.toEqual(en.organization.switcher.add);
});
