import { DesignProvider, type DesignDirection } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import { fireEvent, render } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import { Switch } from '../index.js';

/**
 * A switch is on the mirror list: its thumb slides toward the end of the line, so an Arabic
 * switch slides left when it is turned on (effort 838, requirement 12 as amended 2026-09-27).
 *
 * **Delete the `rtl:` translate from `switch.svelte` and the first test fails.** jsdom lays nothing
 * out and computes no stylesheet, so what is asserted is the class that turns the translate round
 * under a right to left document, beside the one that moves it in either. Which of the two wins is
 * Tailwind's: the `rtl:` rule is emitted after the plain one at the same specificity.
 */
const drawn = (direction: DesignDirection, size?: 'default' | 'sm' | 'lg') => {
	render(
		Switch,
		{ checked: true, size, 'aria-label': 'view complexes' },
		{ wrapper: DesignProvider, wrapperProps: { strings: suppliedStrings({}), direction } }
	);

	return {
		root: document.querySelector<HTMLElement>('[data-slot="switch"]')!,
		thumb: document.querySelector<HTMLElement>('[data-slot="switch-thumb"]')!
	};
};

test('an Arabic switch turns its thumb the other way when it is on', () => {
	const { thumb } = drawn('rtl');

	expect(thumb.className).toContain('rtl:data-[state=checked]:-translate-x-[calc(100%-2px)]');
	expect(thumb.className).toContain('data-[state=checked]:translate-x-[calc(100%-2px)]');
});

test('a switch is a switch, and a press turns it', async () => {
	const { root, thumb } = drawn('ltr');

	expect(root.getAttribute('role')).toBe('switch');
	expect(root.getAttribute('aria-checked')).toBe('true');

	await fireEvent.click(root);

	expect(root.getAttribute('aria-checked')).toBe('false');
	expect(thumb.getAttribute('data-state')).toBe('unchecked');
});

test('the mini switch is a step smaller, thumb and track together', () => {
	const { root, thumb } = drawn('ltr', 'sm');

	expect(root.getAttribute('data-size')).toBe('sm');
	expect(root.className).toContain('w-6');
	expect(thumb.className).toContain('size-3');
});

// effort 846, ticket 49: the switch a tile stands on is larger, and its thumb travels the larger
// track, the other way in Arabic.
test('the large switch is a step larger, and its thumb travels the larger track both ways', () => {
	const { root, thumb } = drawn('rtl', 'lg');

	expect(root.getAttribute('data-size')).toBe('lg');
	expect(root.className).toContain('w-11');
	expect(thumb.className).toContain('size-5');
	expect(thumb.className).toContain('data-[state=checked]:translate-x-[calc(100%+2px)]');
	expect(thumb.className).toContain('rtl:data-[state=checked]:-translate-x-[calc(100%+2px)]');
	expect(thumb.className).not.toContain('calc(100%-2px)');
});
