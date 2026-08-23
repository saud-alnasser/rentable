import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import DialogHarness from '#tests/dialog-harness.svelte';

/**
 * A dialog reads both halves of the contract, and this is the only family in this group that
 * does.
 *
 * Its close control is a glyph whose only name is the supplied word, and its content states the
 * reading direction rather than inheriting one, because `bits-ui` portals it out of the layout:
 * the element it lands beside is `document.body`, so whatever the tree it was written in was
 * reading is not what it would inherit.
 *
 * The fixture opens the dialog rather than driving a trigger, because `bits-ui` instantiates the
 * content only once it is open and an unopened dialog is a test that renders nothing.
 */
test('the close control is named by the string the contract supplied', () => {
	render(
		DialogHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ close: 'إغلاق' }), direction: 'rtl' }
		}
	);

	expect(document.querySelector('[data-dialog-close] span')?.textContent).toBe('إغلاق');
});

test('the portalled content renders in the direction the contract supplied', () => {
	render(
		DialogHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
		}
	);

	expect(screen.getByRole('dialog').getAttribute('dir')).toBe('rtl');
});

test('the same content follows the consumer into the other direction', () => {
	render(
		DialogHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'ltr' }
		}
	);

	expect(screen.getByRole('dialog').getAttribute('dir')).toBe('ltr');
});
