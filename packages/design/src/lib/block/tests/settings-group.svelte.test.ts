import SettingsGroupHarness from '#tests/settings-group-harness.svelte';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The settings group and its row, which every settings section is drawn from.
 *
 * Neither reads the string contract, so they render on their own. What they own is the order (the
 * rows that end something come last), the label a row hands its control, and the tone that marks
 * the act that ends something and no other row.
 */
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];
const nameOf = (row: HTMLElement) =>
	row.querySelector('[data-slot=item-title]')?.textContent?.trim();

test('the group is marked, and its title names it', () => {
	render(SettingsGroupHarness);

	const group = document.querySelector('[data-settings-group]');

	expect(group).not.toBeNull();
	expect(screen.getByRole('region', { name: 'this machine' })).toBe(group);
	expect(group?.textContent).toContain('signing in again brings it back.');
});

test('the row that ends something is drawn last, after a separator', () => {
	render(SettingsGroupHarness);

	expect(rows().map(nameOf)).toEqual(['language', 'password', 'sign out of this machine']);

	const last = rows().at(-1)!;

	expect(last.previousElementSibling?.getAttribute('data-slot')).toBe('item-separator');
	expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

test('a row hands its control the id of its name, so the name labels it', () => {
	render(SettingsGroupHarness);

	const [language] = rows();
	const handed = language.querySelector<HTMLElement>('[data-handed]')!.dataset.handed!;

	expect(document.getElementById(handed)?.textContent?.trim()).toBe('language');
	expect(screen.getByRole('button', { name: 'language' })).toBeDefined();
});

test('the error tone is on the row that ends something, and on it alone', () => {
	render(SettingsGroupHarness);

	expect(rows().map((row) => row.dataset.rowTone)).toEqual(['neutral', 'neutral', 'error']);

	const ending = rows().at(-1)!;

	expect(ending.querySelector('[data-slot=item-media]')?.classList).toContain('text-destructive');
	expect(ending.querySelector('[data-slot=item-title]')?.classList).toContain('text-destructive');

	for (const row of rows().slice(0, -1)) {
		expect(row.querySelector('.text-destructive')).toBeNull();
	}
});

test('every row leads with its glyph and shows a value only where it has one', () => {
	render(SettingsGroupHarness);

	for (const row of rows()) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	}

	expect(rows().map((row) => row.querySelector('[data-row-value]')?.textContent?.trim())).toEqual([
		'english',
		undefined,
		undefined
	]);
});

test('what a row calls for is drawn beneath it, inside the row and not as one of its own', () => {
	render(SettingsGroupHarness);

	const [language, password] = rows();
	const beneath = password.querySelector('[data-row-beneath]');

	expect(beneath?.textContent?.trim()).toBe('set on another machine.');
	expect(beneath?.closest('[data-settings-row]')).toBe(password);
	expect(language.querySelector('[data-row-beneath]')).toBeNull();
	expect(screen.getAllByRole('listitem')).toHaveLength(3);
});
