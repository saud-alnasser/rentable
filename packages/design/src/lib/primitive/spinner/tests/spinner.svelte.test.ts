import { DesignProvider } from '#lib/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import { Spinner } from '../index.js';

/**
 * The first packaged component to read a string from the contract rather than from an
 * application, and the reason this file exists at all.
 *
 * **Deleting `loading` from either object below makes that test fail**, which is the whole
 * point. A spinner is a `role="status"` with no text in it, so its accessible name is everything
 * a reader who cannot see it is given, and before the contract there was nothing to stop a
 * spinner that rendered and said nothing.
 *
 * `wrapper` is what puts the provider above the subject with no fixture in between, and it is
 * what the runner's `globals` setting exists for: the library registers the `beforeEach` that
 * arms `wrapper` only where it finds that function as a global.
 */
test('a packaged component renders the string the contract supplied', () => {
	render(
		Spinner,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: { loading: 'loading' }, direction: 'ltr' }
		}
	);

	expect(screen.getByRole('status').getAttribute('aria-label')).toBe('loading');
});

test('the words belong to the consumer, not to the package', () => {
	render(
		Spinner,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: { loading: 'جارٍ التحميل' }, direction: 'rtl' }
		}
	);

	expect(screen.getByRole('status').getAttribute('aria-label')).toBe('جارٍ التحميل');
});
