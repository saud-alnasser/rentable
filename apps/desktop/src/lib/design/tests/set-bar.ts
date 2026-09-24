// Shared scaffolding for the tests that read the order of a set's bar. Not a `*.test.ts` file, so
// the test runner does not pick it up directly.

import { expect } from 'vitest';

/**
 * What each control in a set's bar is found by. Every set that opens with a bar draws
 * `list-toolbar.svelte`, which draws the field, the count and the order; the list shell adds its
 * selecting and the create control is the one block every set draws.
 */
export const BAR_CONTROL = {
	search: '[data-search-field]',
	count: '[data-list-count]',
	select: '[data-select-control]',
	sort: '[data-sort-control]',
	create: '[data-create-control]'
} as const;

/**
 * The one bar on the page holds each of `selectors`, in that order: the list shell's order is
 * the field, the count, what narrows or reads the set, the order, and what acts on it, with the
 * create last ([[rules/interface]], *Search* and *Create*). A set is held to it by naming the
 * controls it draws.
 */
export function expectBarOrder(selectors: readonly string[]) {
	const bars = document.querySelectorAll('[data-set-bar]');

	expect(bars).toHaveLength(1);

	const found = selectors.map((selector) => {
		const control = bars[0].querySelector(selector);

		expect(control, `the bar draws ${selector}`).not.toBeNull();

		return control!;
	});

	for (let index = 1; index < found.length; index++) {
		const before = found[index - 1];
		const after = found[index];

		expect(
			before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
			`${selectors[index - 1]} comes before ${selectors[index]}`
		).toBeTruthy();
	}
}
