import { LOADING_DELAY, LOADING_HOLD } from '#lib/block/loading.svelte';
import { DesignProvider } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Harness from '#tests/loading-harness.svelte';
import { act, render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

/**
 * When the one loading treatment appears and when it leaves.
 *
 * **The delay and the hold are the whole of what this block decides**, since the shape is the
 * caller's snippet. Both are time, so both are driven with fake timers rather than waited for: a
 * test that slept 200 ms would pass on a machine slow enough to miss the window it is checking.
 */
beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

const show = (loading: boolean) =>
	render(
		Harness,
		{ loading },
		{
			wrapper: DesignProvider,
			wrapperProps: { strings: suppliedStrings({ loading: 'on its way' }), direction: 'ltr' }
		}
	);

const skeleton = () => document.querySelector('[data-testid="skeleton"]');
const content = () => document.querySelector('[data-testid="content"]');

test('nothing is drawn before the delay, and the region is still marked busy', async () => {
	show(true);

	await act(() => vi.advanceTimersByTime(LOADING_DELAY - 1));

	expect(skeleton()).toBeNull();
	expect(content()).toBeNull();
	expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
});

test('the skeleton appears once the delay has run, as a status that says it is loading', async () => {
	show(true);

	await act(() => vi.advanceTimersByTime(LOADING_DELAY));

	expect(skeleton()).not.toBeNull();
	expect(document.querySelector('[role="status"]')?.textContent).toContain('on its way');
});

test('a load that settles inside the delay never draws a skeleton', async () => {
	const { rerender } = show(true);

	await act(() => vi.advanceTimersByTime(LOADING_DELAY / 2));
	await rerender({ loading: false });

	expect(content()).not.toBeNull();

	await act(() => vi.advanceTimersByTime(LOADING_DELAY + LOADING_HOLD));

	expect(skeleton()).toBeNull();
	expect(content()).not.toBeNull();
});

test('a skeleton that has appeared is held, however soon the content arrives', async () => {
	const { rerender } = show(true);

	await act(() => vi.advanceTimersByTime(LOADING_DELAY));
	await rerender({ loading: false });

	await act(() => vi.advanceTimersByTime(LOADING_HOLD - 1));

	expect(skeleton()).not.toBeNull();
	expect(content()).toBeNull();

	await act(() => vi.advanceTimersByTime(1));

	expect(skeleton()).toBeNull();
	expect(content()).not.toBeNull();
});

test('a load that outlasts the hold gives way as soon as it settles', async () => {
	const { rerender } = show(true);

	await act(() => vi.advanceTimersByTime(LOADING_DELAY + LOADING_HOLD * 2));
	await rerender({ loading: false });

	expect(skeleton()).toBeNull();
	expect(content()).not.toBeNull();
});

test('content that was never loading is drawn at once', () => {
	show(false);

	expect(content()).not.toBeNull();
	expect(skeleton()).toBeNull();
});
