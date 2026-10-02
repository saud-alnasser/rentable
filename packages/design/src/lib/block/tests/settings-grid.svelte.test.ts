import SettingsGridHarness from '#tests/settings-grid-harness.svelte';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The settings grid, which lays a section's cards in two columns where the section is wide enough
 * and one where it is not (effort 846, requirement 1).
 *
 * jsdom evaluates no container query, so what is read is what decides it: the grid answers to its
 * own container rather than the window, a spanning card is marked and takes every column, the
 * others take one, and each card holds its title and its footer inside itself.
 */
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-settings-group]')];

test('the grid is one column, and two from the width two cards of 340 and their gap need', () => {
	render(SettingsGridHarness);

	const grid = document.querySelector<HTMLElement>('[data-settings-grid]')!;

	expect(grid.classList).toContain('grid-cols-1');
	expect(grid.classList).toContain('@min-[696px]:grid-cols-2');
	// a short card keeps its own height beside a tall one.
	expect(grid.classList).toContain('items-start');
	// the query reads the section's width, so the container is the grid's own parent.
	expect(grid.parentElement?.classList).toContain('@container');
	expect(cards().every((card) => card.parentElement === grid)).toBe(true);
});

test('the spanning card is marked to span both columns, and the others are not', () => {
	render(SettingsGridHarness);

	expect(cards().map((card) => card.dataset.span ?? null)).toEqual([null, null, 'full']);
	expect(cards().map((card) => card.classList.contains('col-span-full'))).toEqual([
		false,
		false,
		true
	]);
});

test("every card's title and footer are inside it", () => {
	render(SettingsGridHarness);

	expect(cards()).toHaveLength(3);

	for (const card of cards()) {
		const title = card.querySelector('[data-settings-group-header] h2');
		const footer = card.querySelector('[data-settings-group-footer]');

		expect(title?.textContent?.trim()).toBeTruthy();
		expect(footer?.textContent?.trim()).toBeTruthy();
		expect(title?.closest('[data-settings-group]')).toBe(card);
		expect(footer?.closest('[data-settings-group]')).toBe(card);
	}

	// and nothing of a card stands outside it, between it and the next.
	const grid = document.querySelector('[data-settings-grid]')!;

	expect([...grid.children].every((child) => child.hasAttribute('data-settings-group'))).toBe(true);
});
