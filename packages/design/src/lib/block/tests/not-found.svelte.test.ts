import NotFound from '#lib/block/not-found.svelte';
import { backTrail } from '#lib/back.js';
import { forgetNavigations, navigations } from '#tests/app-navigation.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

/**
 * What a surface says when the thing it was asked for is not there, and its one way back.
 *
 * Ticket 30 of effort 832: a missing record and an unknown address were two treatments, and are
 * this block now. The record surface's use of it is read in `record-surface.svelte.test.ts` and
 * the unknown route's in the application's own tests; what is read here is the block: the empty
 * block's not-found shape, the caller's words, and the back control, labelled, as its only act.
 */
const FALLBACK = '/';
const CAME_FROM = '/tenants';
const HERE = '/nowhere';

const notFound = () =>
	render(
		NotFound,
		{
			title: 'this page does not exist',
			description: 'the link may be out of date',
			fallback: FALLBACK
		},
		{
			wrapper: Providers,
			wrapperProps: { strings: suppliedStrings({ goBack: 'go back' }), direction: 'ltr' }
		}
	);

beforeEach(() => {
	forgetNavigations();

	for (const screen of [HERE, CAME_FROM, FALLBACK]) {
		backTrail.forget(screen);
	}
});

test('it says what is missing in the empty block, marked as not found', () => {
	const { container } = notFound();

	const empty = container.querySelector('[data-empty]');

	expect(empty?.getAttribute('data-empty')).toBe('not-found');
	expect(empty?.textContent).toContain('this page does not exist');
	expect(empty?.textContent).toContain('the link may be out of date');
});

test('its one act is the back control, in words rather than a bare arrow', () => {
	const { container } = notFound();

	const controls = container.querySelectorAll('[data-back-control]');

	expect(controls).toHaveLength(1);
	expect(container.querySelectorAll('button')).toHaveLength(1);
	expect(screen.getByRole('button', { name: 'go back' })).toBe(controls[0]);
});

test('back goes where the reader came from', () => {
	backTrail.visit(CAME_FROM);
	backTrail.visit(HERE);

	notFound();
	screen.getByRole('button', { name: 'go back' }).click();

	expect(navigations().map((call) => call.url)).toEqual([CAME_FROM]);
});

test('with nowhere to go back to, back takes the fallback', () => {
	backTrail.visit(HERE);

	notFound();
	screen.getByRole('button', { name: 'go back' }).click();

	expect(navigations().map((call) => call.url)).toEqual([FALLBACK]);
});
