import { DesignProvider } from '#lib/strings.js';
import SettingsRowMenuHarness from '#tests/settings-row-menu-harness.svelte';
import { suppliedStrings } from '#tests/contract-strings.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import LogOutIcon from '@lucide/svelte/icons/log-out';
import PencilIcon from '@lucide/svelte/icons/pencil';
import { beforeAll, expect, test, vi } from 'vitest';

/**
 * A settings row's own menu (effort 846 ticket 29).
 *
 * A row on a growing list offers its secondary acts behind a quiet control at its end, the record
 * menu a record card draws, and the row draws it from the acts it was handed, so a section never
 * reaches for the menu or the tooltip itself ([[contexts/desktop/components]], *A block before a
 * primitive*). What the row owns is the control's name, which is the caller's words for what it
 * acts on, the entries in their order, and an act that cannot run shown refused, reachable, and
 * saying why. The menu is portalled, so what is queried is the document.
 */
const show = (props: Record<string, unknown> = {}) =>
	render(SettingsRowMenuHarness, props, {
		wrapper: DesignProvider,
		wrapperProps: { strings: suppliedStrings(), direction: 'ltr' }
	});

const row = () => document.querySelector<HTMLElement>('[data-settings-row]')!;

const entries = () => [...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')];

// a menu and a tooltip are placed against their trigger, and jsdom implements no ResizeObserver.
beforeAll(() => {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

test('a row given acts draws a menu control named for the row, holding its entries in order', async () => {
	const rename = vi.fn();

	show({
		menu: {
			label: 'actions for the laptop',
			attributes: { 'data-row-menu': 'laptop' },
			acts: [
				{ label: 'rename', icon: PencilIcon, onSelect: rename },
				{ label: 'sign out', icon: LogOutIcon, onSelect: () => {} }
			]
		}
	});

	const control = screen.getByRole('button', { name: 'actions for the laptop' });

	// at the row's end, among its actions, and marked as the caller asked.
	expect(row().querySelector('[data-slot=item-actions]')?.contains(control)).toBe(true);
	expect(control.dataset.rowMenu).toBe('laptop');

	await fireEvent.click(control);

	// each entry leads with its glyph, and its words are drawn as the caller wrote them.
	expect(entries().map((entry) => entry.textContent?.trim())).toEqual(['rename', 'sign out']);
	expect(entries().every((entry) => entry.firstElementChild?.tagName.toLowerCase() === 'svg')).toBe(
		true
	);

	await fireEvent.click(entries()[0]);

	expect(rename).toHaveBeenCalledTimes(1);
});

test('an act that cannot run is drawn refused, stays reachable, and says why', async () => {
	const onSelect = vi.fn();
	const reason = 'it has not run this version; sign out every other machine instead.';

	show({
		menu: {
			label: 'actions for the laptop',
			acts: [{ label: 'sign out', icon: LogOutIcon, unavailable: reason, onSelect }]
		}
	});

	await fireEvent.click(screen.getByRole('button', { name: 'actions for the laptop' }));

	const [refused] = entries();

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(refused.hasAttribute('data-unavailable')).toBe(true);
	// reachable: the menu's own disabled mark is what would take it out of the keyboard's path.
	expect(refused.hasAttribute('data-disabled')).toBe(false);

	await fireEvent.focus(refused);

	const drawn = await waitFor(() => {
		const found = document.querySelector('[data-unavailable-reason]');

		expect(found).not.toBeNull();

		return found;
	});

	expect(drawn?.textContent).toBe(reason);

	await fireEvent.click(refused);

	expect(onSelect).not.toHaveBeenCalled();
});

test('a row with no acts, or none to offer, draws no menu control', () => {
	show();

	expect(row().querySelector('button')).toBeNull();
	expect(row().querySelector('[data-slot=item-actions]')).toBeNull();

	cleanup();

	show({ menu: { label: 'actions for the laptop', acts: [] } });

	expect(row().querySelector('button')).toBeNull();
});
