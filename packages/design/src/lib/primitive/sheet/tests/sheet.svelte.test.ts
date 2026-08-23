import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import SheetHarness from '#tests/sheet-harness.svelte';

/**
 * A sheet reads the direction twice, and the second read is the one worth a test of its own.
 *
 * The first is `dir` on the portalled content, as a dialog's is. The second decides which edge
 * the sheet slides in from: a sheet with no side asked for arrives at the trailing edge, and
 * which edge that is depends on the reader rather than on the layout. Get it wrong and the sheet
 * is still a sheet, still opens, and covers the navigation instead of standing beside it.
 *
 * The side is asserted through the class the variant applies, because the component's own name
 * for it is internal and what a reader would notice is where the thing came from.
 */
test('the close control is named by the string the contract supplied', () => {
	render(
		SheetHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ close: 'إغلاق' }), direction: 'rtl' }
		}
	);

	expect(document.querySelector('[data-dialog-close] span')?.textContent).toBe('إغلاق');
});

test('the sheet arrives at the trailing edge of the direction the contract supplied', () => {
	render(
		SheetHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
		}
	);

	const content = screen.getByRole('dialog');

	expect(content.getAttribute('dir')).toBe('rtl');
	expect(content.className).toContain('start-0');
});

test('the same sheet arrives at the other edge in the other direction', () => {
	render(
		SheetHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'ltr' }
		}
	);

	const content = screen.getByRole('dialog');

	expect(content.getAttribute('dir')).toBe('ltr');
	expect(content.className).toContain('end-0');
});
