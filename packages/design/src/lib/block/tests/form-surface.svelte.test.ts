import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import FormSurfaceHarness from '#tests/form-surface-harness.svelte';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * The one block that reads both halves of the contract.
 *
 * Its panel is `bits-ui`'s own content rather than the dialog primitive's, and it is portalled
 * to `document.body`, so the direction it renders in is the one it states and never one it
 * inherits: a form that dropped the read would look correct in a left-to-right consumer and
 * wrong in every other, with nothing to report it. That is the whole reason both directions are
 * asserted rather than one.
 */
const surface = () => document.querySelector('[data-slot="form-surface"]');

test('the portalled panel renders in the direction the contract supplied', () => {
	render(
		FormSurfaceHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
		}
	);

	expect(surface()?.getAttribute('dir')).toBe('rtl');
});

test('the same panel follows the consumer into the other direction', () => {
	render(
		FormSurfaceHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings(), direction: 'ltr' }
		}
	);

	expect(surface()?.getAttribute('dir')).toBe('ltr');
});

test('the corner close control is named by the string the contract supplied', () => {
	render(
		FormSurfaceHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ close: 'إغلاق' }), direction: 'rtl' }
		}
	);

	expect(document.querySelector('[data-slot="dialog-close"] span')?.textContent).toBe('إغلاق');
});
