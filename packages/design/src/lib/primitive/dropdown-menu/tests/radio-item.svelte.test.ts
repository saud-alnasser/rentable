import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Harness from '#tests/radio-item-harness.svelte';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

/**
 * A RADIO ROW MARKS ITS CHOICE WITH A DOT, OR WITH A CHECK WHEN ASKED
 *
 * The radio item takes `indicator: 'dot' | 'check'` (effort 843, ticket 09). The dot is the ported
 * disc and stays the default, so no menu that already uses the item changes; the check is what a
 * menu of places asks for, to say which one you are in, as the workspace control does. Either way
 * the row is a `menuitemradio` with `aria-checked`, which is what a screen reader announces, and
 * only the chosen row draws its mark.
 *
 * jsdom draws nothing, so what is read is the glyph lucide renders into the indicator's column:
 * its `lucide-circle` or `lucide-check` class.
 */

beforeEach(() => {
	// floating-ui measures the trigger with this, and jsdom carries none.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const rows = (indicator?: 'dot' | 'check') => {
	render(Harness, indicator ? { indicator } : {}, {
		wrapper: DesignProvider,
		wrapperProps: { strings: suppliedStrings({}), direction: 'ltr' }
	});

	return screen.getAllByRole('menuitemradio');
};

test('left to its default, the chosen row is marked with the dot', () => {
	const [north, south] = rows();

	expect(north?.getAttribute('aria-checked')).toBe('true');
	expect(north?.querySelector('.lucide-circle')).not.toBeNull();
	expect(north?.querySelector('.lucide-check')).toBeNull();
	expect(south?.getAttribute('aria-checked')).toBe('false');
	expect(south?.querySelector('svg')).toBeNull();
});

test('asked for the check, the chosen row is marked with a check and no dot', () => {
	const [north, south] = rows('check');

	expect(north?.getAttribute('aria-checked')).toBe('true');
	expect(north?.querySelector('.lucide-check')).not.toBeNull();
	expect(north?.querySelector('.lucide-circle')).toBeNull();
	expect(south?.getAttribute('aria-checked')).toBe('false');
	expect(south?.querySelector('svg')).toBeNull();
});
