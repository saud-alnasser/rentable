import BackControl from '#lib/block/back-control.svelte';
import { backTrail } from '#lib/back.js';
import { back } from '#lib/back.svelte.js';
import { type DesignStrings } from '#lib/strings.js';
import { forgetNavigations, navigations } from '#tests/app-navigation.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

/**
 * The control that returns a reader to where they came from, and the three places it reads
 * `previous`.
 *
 * **It could not be tested until the runner supplied `$app/navigation`**, because pressing it
 * calls `goto` through `back.svelte.ts`. `#tests/app-navigation.js` is what that specifier
 * resolves to, and it records the call rather than only satisfying the import.
 *
 * **The word is read three times on one control**: as the button's `aria-label`, as the visually
 * hidden text inside it, and as the tooltip's content. All three are the contract's rather than a
 * prop, so a consumer cannot correct any of them. Only two of the three are reachable at
 * render: `Tooltip.Content` is instantiated by bits-ui when the tooltip opens, so a render-time
 * assertion cannot see it. That is the same limit the spec names for eight primitive families,
 * and it is written here rather than left as a gap somebody rediscovers.
 *
 * **The subject needs two providers above it**, which is why `#tests/providers.svelte` is the
 * wrapper: it draws a tooltip, and it reads the string contract.
 */
const WORD = 'the way back';

// the fallback is a different screen from anything the trail below is given, so an assertion
// cannot pass by landing on the right path for the wrong reason.
const FALLBACK = '/tenants';
const CAME_FROM = '/complexes';
const HERE = '/tenants/1';

const control = (strings: Partial<DesignStrings> = { previous: WORD }) =>
	render(
		BackControl,
		{ fallback: FALLBACK },
		{
			wrapper: Providers,
			wrapperProps: { strings: suppliedStrings(strings), direction: 'rtl' }
		}
	);

// the trail is the session's one module, so a test that left a screen on it would be read by the
// next one in the file.
beforeEach(() => {
	forgetNavigations();

	for (const screen of [HERE, CAME_FROM, FALLBACK]) {
		backTrail.forget(screen);
	}
});

test('the control is named by the contract, and named the same way twice', () => {
	const { container } = control();

	expect(screen.getByRole('button', { name: WORD })).toBeDefined();
	expect(container.querySelector('.sr-only')?.textContent).toBe(WORD);
});

test('pressing it goes back to where the reader was, not to the fallback', () => {
	backTrail.visit(CAME_FROM);
	backTrail.visit(HERE);

	expect(back.destination).toBe(CAME_FROM);

	control();
	screen.getByRole('button', { name: WORD }).click();

	expect(navigations().map((call) => call.url)).toEqual([CAME_FROM]);
});

test('pressing it with nowhere to go back to takes the fallback', () => {
	backTrail.visit(HERE);

	expect(back.destination).toBe(null);

	control();
	screen.getByRole('button', { name: WORD }).click();

	expect(navigations().map((call) => call.url)).toEqual([FALLBACK]);
});
