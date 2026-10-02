import SettingsGroupHarness from '#tests/settings-group-harness.svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The settings card and its row, which every settings section is drawn from.
 *
 * Neither reads the string contract, so they render on their own. What they own is the card's
 * anatomy (the header inside it, the footer at its foot), the order (the rows that end something
 * come last), the label a row hands its control, the mark on the act that ends something and no
 * other row, and the detail a row folds under it.
 */
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-settings-row]')];
const nameOf = (row: HTMLElement) =>
	row.querySelector('[data-slot=item-title] span')?.textContent?.trim();
const folding = () => document.querySelector<HTMLElement>('[data-row-details]')!;
const chevron = () => folding().querySelector<HTMLButtonElement>('[data-row-details-trigger]')!;

test('the card is marked, its title names it, and its header and footer are inside it', () => {
	render(SettingsGroupHarness);

	const group = document.querySelector<HTMLElement>('[data-settings-group]')!;
	const header = group.querySelector('[data-settings-group-header]')!;

	expect(screen.getByRole('region', { name: 'this machine' })).toBe(group);
	expect(header.querySelector('h2')?.textContent?.trim()).toBe('this machine');
	expect(header.querySelector('[data-settings-group-description]')?.textContent?.trim()).toBe(
		'what this machine holds.'
	);
	expect(header.querySelector('[data-settings-group-glyph] svg')).not.toBeNull();
	expect(header.querySelector('[data-settings-group-value]')?.textContent?.trim()).toBe('2 rows');
	expect(group.querySelector('[data-settings-group-footer]')?.textContent?.trim()).toBe(
		'signing in again brings it back.'
	);
	expect(group.lastElementChild?.hasAttribute('data-settings-group-footer')).toBe(true);
});

test('the row that ends something is drawn last, after a separator', () => {
	render(SettingsGroupHarness);

	expect(rows().map(nameOf)).toEqual([
		'language',
		'password',
		'log folder',
		'sign out of this machine'
	]);

	const last = rows().at(-1)!;

	expect(last.previousElementSibling?.getAttribute('data-slot')).toBe('item-separator');
	expect(screen.getAllByRole('listitem')).toHaveLength(4);
});

test('a row hands its control the id of its name, so the name labels it', () => {
	render(SettingsGroupHarness);

	const [language] = rows();
	const handed = language.querySelector<HTMLElement>('[data-handed]')!.dataset.handed!;

	expect(document.getElementById(handed)?.textContent?.trim()).toBe('language');
	expect(screen.getByRole('button', { name: 'language' })).toBeDefined();
});

// effort 846 ticket 31, at the human's word of 2026-10-02 ("only the action button shoud be in
// red"): the row that ends something is marked, and its glyph and name are as neutral as any row's,
// so the one red in it is the act's button.
test('the row that ends something is marked, and only its button is red', () => {
	render(SettingsGroupHarness);

	expect(rows().map((row) => row.dataset.rowTone)).toEqual([
		'neutral',
		'neutral',
		'neutral',
		'error'
	]);

	const ending = rows().at(-1)!;
	const glyph = ending.querySelector('[data-slot=item-media]')!;
	const name = ending.querySelector('[data-slot=item-title]')!;

	expect(glyph.className).not.toMatch(/destructive/);
	expect(name.className).not.toMatch(/destructive/);
	// muted beside its name, as every neutral row's glyph is.
	expect(glyph.classList).toContain('text-muted-foreground');
	expect(ending.querySelectorAll('.text-destructive')).toHaveLength(1);
	expect(ending.querySelector('.text-destructive')?.hasAttribute('data-ending-act')).toBe(true);

	for (const row of rows().slice(0, -1)) {
		expect(row.querySelector('.text-destructive')).toBeNull();
	}

	// the card itself carries no tone: not on its edge, not on a band.
	const group = document.querySelector<HTMLElement>('[data-settings-group]')!;

	expect(group.className).not.toMatch(/destructive/);
});

test('every row leads with its glyph and shows a value only where it has one', () => {
	render(SettingsGroupHarness);

	for (const row of rows()) {
		expect(row.querySelector('[data-slot=item-media] svg')).not.toBeNull();
	}

	expect(rows().map((row) => row.querySelector('[data-row-value]')?.textContent?.trim())).toEqual([
		'english',
		undefined,
		'kept here',
		undefined
	]);
});

test('a row carries its meta line under its name and its badge beside it', () => {
	render(SettingsGroupHarness);

	const password = rows()[1];
	const title = password.querySelector('[data-slot=item-title]')!;
	const meta = password.querySelector('[data-row-meta]')!;

	expect(meta.textContent?.trim()).toBe('changed last week');
	// under the name: in the same column as the title, after it.
	expect(meta.parentElement).toBe(title.parentElement);
	expect(title.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(title.querySelector('[data-row-badge]')?.textContent?.trim()).toBe('set');
	expect(rows()[0].querySelector('[data-row-meta]')).toBeNull();
});

test('what a row calls for is drawn beneath it, inside the row and not as one of its own', () => {
	render(SettingsGroupHarness);

	const [language, password] = rows();
	const beneath = password.querySelector('[data-row-beneath]');

	expect(beneath?.textContent?.trim()).toBe('set on another machine.');
	expect(beneath?.closest('[data-settings-row]')).toBe(password);
	expect(language.querySelector('[data-row-beneath]')).toBeNull();
	expect(screen.getAllByRole('listitem')).toHaveLength(4);
});

// effort 846, *Detail that few readers need folds under its row*: closed by default, the value and
// the control still in view, and the chevron tied to what it opens.
test('a row with details is closed by default, its value and control in view', () => {
	render(SettingsGroupHarness);

	const row = folding();

	expect(nameOf(row)).toBe('log folder');
	expect(chevron().getAttribute('aria-expanded')).toBe('false');
	expect(chevron().getAttribute('aria-label')).toBe('the whole path');
	expect(row.querySelector('[data-full-path]')).toBeNull();
	expect(row.querySelector('[data-row-value]')?.textContent?.trim()).toBe('kept here');
	expect(row.querySelector('[data-reveal]')).not.toBeNull();
	// the chevron comes after the control, at the row's end.
	expect(
		row.querySelector('[data-reveal]')!.compareDocumentPosition(chevron()) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test('the chevron opens the detail it controls, by Enter and by Space', async () => {
	render(SettingsGroupHarness);

	await fireEvent.keyDown(chevron(), { key: 'Enter' });

	expect(chevron().getAttribute('aria-expanded')).toBe('true');

	const controlled = document.getElementById(chevron().getAttribute('aria-controls')!);

	expect(controlled).not.toBeNull();
	expect(controlled?.querySelector('[data-full-path]')?.textContent).toContain('logs');
	expect(controlled?.closest('[data-settings-row]')).toBe(folding());

	await fireEvent.keyDown(chevron(), { key: ' ' });

	expect(chevron().getAttribute('aria-expanded')).toBe('false');
	expect(folding().querySelector('[data-full-path]')).toBeNull();

	await fireEvent.keyDown(chevron(), { key: ' ' });

	expect(chevron().getAttribute('aria-expanded')).toBe('true');
});

test('a row in the end takes no details, whatever it is handed', () => {
	render(SettingsGroupHarness);

	const ending = rows().at(-1)!;

	expect(ending.hasAttribute('data-row-details')).toBe(false);
	expect(ending.querySelector('[data-row-details-trigger]')).toBeNull();
	expect(ending.querySelector('[data-full-path]')).toBeNull();
	expect(document.querySelectorAll('[data-row-details]')).toHaveLength(1);
});
