import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { layOutLists } from '#tests/permission.ts';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import ListGridHarness from './list-grid-harness.svelte';

/**
 * A LIST LAID AS A GRID OF TILES
 *
 * Requirement 18 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: the shell
 * lays records as tiles, up to three across with a gap between them, and virtualises them as it
 * does one column. Requirement 19: a tile carries its heading, its status with its word, its facts
 * and the control, and both of the card's routes still open the same acts.
 *
 * jsdom lays nothing out, so the window is given its measures: every element reports the width
 * of a wide window and the height of a tall one, which is what the column count and the
 * virtualiser read.
 */

const WIDE = 1000;

let measures: MockInstance[] = [];

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	layOutLists();

	measures = [
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDE),
		vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(WIDE),
		vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800)
	];
});

afterEach(() => {
	for (const measure of measures) {
		measure.mockRestore();
	}
	document.body.innerHTML = '';
});

const tiles = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		id: `t${index}`,
		name: `tile ${index}`,
		place: `street ${index}`
	}));

test('a thousand records are laid three to a row, and only the ones in view are drawn', async () => {
	render(ListGridHarness, { data: tiles(1000) });

	await waitFor(() => expect(document.querySelector('[data-record-grid]')).not.toBeNull());

	const grids = [...document.querySelectorAll('[data-record-grid]')];
	const drawn = document.querySelectorAll('[data-record]').length;

	expect(grids.length).toBeGreaterThan(1);
	for (const grid of grids) {
		expect(grid.querySelectorAll(':scope > [data-record]')).toHaveLength(3);
		expect((grid as HTMLElement).style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
	}
	expect(drawn).toBeGreaterThan(0);
	expect(drawn).toBeLessThan(1000);
});

test('the grid carries the gap between its tiles', async () => {
	render(ListGridHarness, { data: tiles(6) });

	await waitFor(() => expect(document.querySelector('[data-record-grid]')).not.toBeNull());

	for (const grid of document.querySelectorAll('[data-record-grid]')) {
		expect(grid.classList).toContain('gap-3');
	}
});

test('and so does its skeleton, in the same three columns', async () => {
	render(ListGridHarness, { data: [], isLoading: true });

	// the skeleton is drawn once a load has run past the loading block's own delay.
	const rows = await waitFor(() => {
		const drawn = [...document.querySelectorAll<HTMLElement>('[data-skeleton-row]')];

		expect(drawn.length).toBeGreaterThan(0);

		return drawn;
	});

	for (const row of rows) {
		expect(row.classList).toContain('gap-3');
		expect(row.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
	}
});

test('a tile draws its heading, its status with its word, its facts and the control', async () => {
	render(ListGridHarness, { data: tiles(3) });

	const tile = await waitFor(() => {
		const link = screen.getByRole('link', { name: 'tile 0' });

		return link.parentElement!;
	});

	expect(tile.dataset.layout).toBe('tile');

	const [, headingLine, fact] = [...tile.children];

	expect(headingLine.textContent).toContain('tile 0');
	expect(headingLine.querySelector('[data-status-labelled]')?.textContent?.trim()).toBe('active');
	expect(headingLine.querySelector('button')).not.toBeNull();
	expect(fact.hasAttribute('data-fact')).toBe(true);
	expect(fact.textContent?.trim()).toBe('street 0');
	expect(fact.querySelector('svg')).not.toBeNull();
});

test('both routes of a tile open the same acts', async () => {
	render(ListGridHarness, { data: tiles(3) });

	const tile = await waitFor(() => screen.getByRole('link', { name: 'tile 1' }).parentElement!);

	await fireEvent.click(tile.querySelector('button')!);

	const throughControl = [...document.querySelectorAll('[data-slot=dropdown-menu-item]')].map(
		(entry) => entry.textContent?.trim()
	);

	await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
	await fireEvent.contextMenu(tile);

	const throughGesture = [...document.querySelectorAll('[data-slot=context-menu-item]')].map(
		(entry) => entry.textContent?.trim()
	);

	expect(throughControl).toEqual(['Edit']);
	expect(throughGesture).toEqual(throughControl);
});

test('the selection box of a tile stands beside it, level with its heading', async () => {
	render(ListGridHarness, { data: tiles(3), selectable: true });

	await fireEvent.click(
		await waitFor(() => document.querySelector<HTMLElement>('[data-select-control]')!)
	);

	const box = await waitFor(() => screen.getAllByRole('checkbox')[0]);
	const holder = box.parentElement!;
	const cell = holder.parentElement!;

	expect(cell.classList).toContain('items-start');
	expect(holder.classList).toContain('pt-6');
});
