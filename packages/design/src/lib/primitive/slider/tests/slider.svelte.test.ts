import { DesignProvider, type DesignDirection } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';
import { Slider } from '../index.js';

/**
 * A slider is on the mirror list: its range fills from the start edge, so an Arabic slider fills
 * from the right and its arrow keys step up toward the left ([[rules/frontend]], *i18n*).
 *
 * **Drop `dir={contract.direction}` from `slider.svelte` and the Arabic tests fail.** jsdom lays
 * nothing out, so what is asserted is the edge bits-ui anchors the range and the thumb to, which
 * it writes as an inline style from the direction it is handed.
 */
beforeEach(() => {
	// bits-ui measures the thumb with this to keep it inside the track, and jsdom carries none.
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const drawn = (direction: DesignDirection, value = 2) => {
	render(
		Slider,
		{ value, min: 0, max: 4, step: 1, thumbLabel: 'lifetime', valueText: `${value} steps` },
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings({}), direction } }
	);

	return {
		range: document.querySelector<HTMLElement>('[data-slot="slider-range"]')!,
		thumb: document.querySelector<HTMLElement>('[data-slot="slider-thumb"]')!
	};
};

test('a slider is a slider, named and saying its value on its thumb', () => {
	const { thumb } = drawn('ltr');

	expect(thumb.getAttribute('role')).toBe('slider');
	expect(thumb.getAttribute('aria-label')).toBe('lifetime');
	expect(thumb.getAttribute('aria-valuetext')).toBe('2 steps');
	expect(thumb.getAttribute('aria-valuenow')).toBe('2');
	expect(thumb.getAttribute('aria-valuemin')).toBe('0');
	expect(thumb.getAttribute('aria-valuemax')).toBe('4');
});

test('in english the range fills from the left and the right arrow steps up', async () => {
	const { range, thumb } = drawn('ltr');

	expect(range.style.left).toBe('0%');
	expect(range.style.right).not.toBe('0%');

	await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
	expect(thumb.getAttribute('aria-valuenow')).toBe('3');

	await fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
	await fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
	expect(thumb.getAttribute('aria-valuenow')).toBe('1');
});

test('in arabic the range fills from the right and the left arrow steps up', async () => {
	const { range, thumb } = drawn('rtl');

	expect(range.style.right).toBe('0%');
	expect(range.style.left).not.toBe('0%');

	await fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
	expect(thumb.getAttribute('aria-valuenow')).toBe('3');

	await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
	await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
	expect(thumb.getAttribute('aria-valuenow')).toBe('1');
});

test('home and end take the thumb to the first and the last step', async () => {
	const { thumb } = drawn('rtl');

	await fireEvent.keyDown(thumb, { key: 'End' });
	expect(thumb.getAttribute('aria-valuenow')).toBe('4');

	await fireEvent.keyDown(thumb, { key: 'Home' });
	expect(thumb.getAttribute('aria-valuenow')).toBe('0');
});
