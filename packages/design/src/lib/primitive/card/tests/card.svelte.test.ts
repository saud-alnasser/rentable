import { DesignProvider } from '#lib/strings.js';
import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import { Card } from '../index.js';

/**
 * The first family to take its reading direction from the contract rather than from this
 * application's locale, and the reason the fixture in `src/tests/contract.svelte` is no longer
 * the only thing covering that half of it.
 *
 * **Delete `dir={contract.direction}` from `card.svelte` and both tests below fail.** That is
 * the whole point of covering it: a component that stops setting the attribute still compiles
 * and still renders, and what it produces is a left-to-right box on a page somebody is reading
 * right to left. Nothing else in the toolchain reports it.
 *
 * `card` is the subject because it sets the attribute on a plain element it renders itself.
 * Eight of the other nine in this group are portal-backed overlays or need an open state, so a
 * test against one of them would be measuring `bits-ui` as much as the direction read.
 * `toggle-group` is the ninth and is neither, but it sets `dir` on a `bits-ui` root rather than
 * on an element of its own, and its items take the direction by inheriting rather than by
 * reading. `card` is the shorter path to the same assertion.
 */
test('a packaged family renders in the direction the contract supplied', () => {
	render(
		Card,
		{ 'data-testid': 'card' },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: { loading: 'loading' }, direction: 'rtl' }
		}
	);

	expect(screen.getByTestId('card').getAttribute('dir')).toBe('rtl');
});

test('the same family follows the consumer into the other direction', () => {
	render(
		Card,
		{ 'data-testid': 'card' },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: { loading: 'loading' }, direction: 'ltr' }
		}
	);

	expect(screen.getByTestId('card').getAttribute('dir')).toBe('ltr');
});
