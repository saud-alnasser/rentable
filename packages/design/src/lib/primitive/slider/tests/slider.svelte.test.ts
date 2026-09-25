import { DesignProvider, type DesignDirection } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import { Slider } from '../index.js';

/**
 * A slider is on the mirror list: its range fills from the start edge, so an Arabic slider fills
 * from the right (requirement 3 of effort 832).
 *
 * **Delete `dir={contract.direction}` from `slider.svelte` and the first test fails.** bits-ui
 * defaults a slider to left to right and reads no direction from the document, so the attribute
 * is the whole of what turns it round. jsdom lays nothing out, so what is asserted is the edge
 * bits-ui anchors the range to, which it writes as an inline style.
 */
const slider = (direction: DesignDirection) => {
	// bits-ui measures the thumb, and jsdom implements no ResizeObserver.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	render(
		Slider,
		{ type: 'single', value: 30 },
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings({}), direction } }
	);

	return document.querySelector<HTMLElement>('[data-slot="slider-range"]')!;
};

test('an Arabic slider fills from the right edge', () => {
	const range = slider('rtl');

	expect(range.style.right).toBe('0%');
	expect(range.style.left).toBe('70%');
});

test('an English slider fills from the left edge', () => {
	const range = slider('ltr');

	expect(range.style.left).toBe('0%');
	expect(range.style.right).toBe('70%');
});
