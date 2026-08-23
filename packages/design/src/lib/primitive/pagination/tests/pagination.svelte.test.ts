import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import PaginationHarness from '#tests/pagination-harness.svelte';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * Pagination renders six of the seventeen keys, which is more than any other family here, and
 * two of them are the only words in this package a reader actually sees.
 *
 * `next` and `previous` are printed beside the glyph at the wider sizes; `goToNextPage` and
 * `goToPreviousPage` are the same two controls' accessible names and are never printed. Both
 * pairs are asserted, because a control that shows the right word and answers to the wrong one
 * reads correctly and is unusable without sight.
 *
 * **Every one of the four is read off the control it belongs to.** The two controls differ only
 * in their keys and their glyph, so a test that asks whether a word is present passes with the
 * pair swapped, which is the mistake a by-hand replacement of six reads is most likely to make.
 *
 * The two are also read from different halves of this application's dictionary, `common.ui` and
 * `common.table`, which the contract flattens. That is stated where the consumer supplies them.
 */
test('every string a pagination control renders is the one the contract supplied for it', () => {
	render(
		PaginationHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({
					pagination: 'ترقيم الصفحات',
					previous: 'السابق',
					next: 'التالي',
					morePages: 'صفحات أخرى',
					goToPreviousPage: 'اذهب إلى الصفحة السابقة',
					goToNextPage: 'اذهب إلى الصفحة التالية'
				}),
				direction: 'rtl'
			}
		}
	);

	const previous = document.querySelector('[data-pagination-prev]');
	const next = document.querySelector('[data-pagination-next]');

	expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe('ترقيم الصفحات');
	expect(previous?.getAttribute('aria-label')).toBe('اذهب إلى الصفحة السابقة');
	expect(previous?.querySelector('span')?.textContent).toBe('السابق');
	expect(next?.getAttribute('aria-label')).toBe('اذهب إلى الصفحة التالية');
	expect(next?.querySelector('span')?.textContent).toBe('التالي');
	expect(document.querySelector('[data-slot="pagination-ellipsis"] span')?.textContent).toBe(
		'صفحات أخرى'
	);
});
