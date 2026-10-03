import SettingsGridHarness from '#tests/settings-grid-harness.svelte';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The settings column, which stands a section's cards one under the next (effort 846, requirement 1
 * as revised on 2026-10-02: "each card is under the next card").
 *
 * jsdom lays nothing out, so what is read is what decides it: one flex column with no grid and no
 * width at which a second column appears, every card its item, in the order it was written.
 */
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-settings-group]')];

test('the cards stand in one column at every width, in source order', () => {
	render(SettingsGridHarness);

	const column = document.querySelector<HTMLElement>('[data-settings-grid]')!;

	expect(column.classList).toContain('flex');
	expect(column.classList).toContain('flex-col');
	// no grid, and nothing a container or a window could widen into two.
	expect(column.className).not.toMatch(/grid-cols|@container|@min-|(^|\s)(sm|md|lg|xl):/);
	expect(column.parentElement?.className ?? '').not.toMatch(/@container/);
	expect(cards().every((card) => card.parentElement === column)).toBe(true);
	expect(cards().map((card) => card.querySelector('h2')?.textContent?.trim())).toEqual([
		'display',
		'updates',
		'diagnostics'
	]);
});

test('no card spans or is told how wide to be', () => {
	render(SettingsGridHarness);

	for (const card of cards()) {
		expect(card.dataset.span).toBeUndefined();
		expect(card.className).not.toMatch(/col-span/);
	}
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
