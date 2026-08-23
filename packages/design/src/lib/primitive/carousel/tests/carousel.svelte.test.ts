import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import CarouselHarness from '#tests/carousel-harness.svelte';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * Both of a carousel's controls are a glyph and a name nobody sees.
 *
 * **Each word is read off the control that should be carrying it**, rather than looked for
 * anywhere in the document. The two controls are identical but for their key, so asking whether
 * a word is present passes just as happily when the two have been swapped, and a swap is the one
 * mistake this edit could actually make.
 *
 * The fixture says why it renders no `Carousel.Content`.
 */
const wordOn = (slot: string) => document.querySelector(`[data-slot="${slot}"] span`)?.textContent;

test('each control carries the word the contract supplied for it', () => {
	render(
		CarouselHarness,
		{},
		{
			wrapper: DesignProvider,
			wrapperProps: {
				strings: suppliedStrings({
					nextSlide: 'الشريحة التالية',
					previousSlide: 'الشريحة السابقة'
				}),
				direction: 'rtl'
			}
		}
	);

	expect(wordOn('carousel-next')).toBe('الشريحة التالية');
	expect(wordOn('carousel-previous')).toBe('الشريحة السابقة');
});
