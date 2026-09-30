// Shared scaffolding for the tests that read where a set draws its create control. Not a
// `*.test.ts` file, so the test runner does not pick it up directly.

import { expect } from 'vitest';

/**
 * The one create control on the page sits in the one position every set gives it: the last
 * element at the end of the bar above the records, which is the last thing in that bar. The list
 * shell and the settings directories' tray both draw `list-toolbar.svelte`, which marks both, so one
 * assertion reads both ([[rules/interface]], *Create*).
 */
export function expectCreateControlLast() {
	const controls = document.querySelectorAll('[data-create-control]');

	expect(controls).toHaveLength(1);

	const control = controls[0];
	const end = control.closest('[data-set-bar-end]');
	const bar = control.closest('[data-set-bar]');

	expect(end, 'the control stands in the end of a set bar').not.toBeNull();
	expect(bar, 'the end belongs to a set bar').not.toBeNull();
	expect(end?.lastElementChild?.contains(control), 'last at the end of the bar').toBe(true);
	expect(bar?.lastElementChild, 'the end is the last thing in the bar').toBe(end);
}
