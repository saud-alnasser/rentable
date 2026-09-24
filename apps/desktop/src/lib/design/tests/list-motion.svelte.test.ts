import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import ListMotionHarness from './list-motion-harness.svelte';

/**
 * A DIRECTORY MOVES WHEN ITS RESULT SET CHANGES, EXCEPT UNDER ITS OWN SEARCH
 *
 * Requirement 4 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], criterion
 * 4(c), and ticket 06's second criterion: a change the list did not cause by its own search is
 * committed inside a view transition, and one its search caused is committed at once.
 *
 * jsdom has no `startViewTransition`, so each test that wants one stubs it. The stub runs the
 * update the way the browser does, after the call returns, and records what the document looked
 * like when it was asked, which is when the browser captures the old state.
 */

// the block's own wait before a keystroke becomes a search, and a little over it.
const PAST_THE_DEBOUNCE_MS = 300;

const records = (...ids: string[]) => ids.map((id) => ({ id }));

type Asked = { marked: boolean; clip: string };

function stubViewTransitions() {
	const asked: Asked[] = [];
	const start = vi.fn((update: () => Promise<void> | void) => {
		const root = document.documentElement;

		asked.push({
			marked: root.hasAttribute('data-list-motion'),
			clip: root.style.getPropertyValue('--list-motion-clip')
		});

		const updated = Promise.resolve().then(update);

		return {
			updateCallbackDone: updated,
			ready: updated,
			finished: updated.then(() => undefined),
			skipTransition: () => {}
		};
	});

	Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });

	return { start, asked };
}

beforeEach(() => {
	loadLocale('en');
	setLocale('en');

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	delete (document as { startViewTransition?: unknown }).startViewTransition;
});

test('a change the list did not cause is committed inside a view transition', async () => {
	const { start, asked } = stubViewTransitions();
	const { rerender } = render(ListMotionHarness, { data: records('one', 'two') });

	await rerender({ data: records('one', 'two', 'three') });

	await waitFor(() => expect(screen.getByText('3 results')).toBeTruthy());
	expect(start).toHaveBeenCalledTimes(1);
	// the document is marked, and the clip is stated, before the old state is captured.
	expect(asked[0].marked).toBe(true);
	expect(asked[0].clip).toMatch(/^inset\(/);
	// and the marks are taken away once it ends.
	await waitFor(() =>
		expect(document.documentElement.hasAttribute('data-list-motion')).toBe(false)
	);
});

test("a change answering the list's own search is committed without one", async () => {
	const { start } = stubViewTransitions();
	const { rerender } = render(ListMotionHarness, { data: records('one', 'two') });

	await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'one' } });
	await new Promise((resolve) => setTimeout(resolve, PAST_THE_DEBOUNCE_MS));
	await rerender({ data: records('one') });

	await waitFor(() => expect(screen.getByText('1 result')).toBeTruthy());
	expect(start).not.toHaveBeenCalled();

	// the search is spent by the change that answered it, so the next one moves again.
	await rerender({ data: records('one', 'four') });

	await waitFor(() => expect(screen.getByText('2 results')).toBeTruthy());
	expect(start).toHaveBeenCalledTimes(1);
});

test('a record edited in place moves nothing, so it is committed without one', async () => {
	const { start } = stubViewTransitions();
	const { rerender } = render(ListMotionHarness, { data: records('one', 'two') });

	await rerender({ data: records('one', 'two') });

	expect(start).not.toHaveBeenCalled();
});

test('where the webview has no view transitions, the change is committed directly', async () => {
	const { rerender } = render(ListMotionHarness, { data: records('one', 'two') });

	await rerender({ data: records('two') });

	await waitFor(() => expect(screen.getByText('1 result')).toBeTruthy());
});

/**
 * Which record wears which name, read the way the browser reads it: by the text the record draws,
 * against the `view-transition-name` on the element that carries it. Every named element is
 * listed, so anything named that is not a record shows up as a name with no text.
 */
function namesOnScreen() {
	const named = [...document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')];

	return new Map(
		named.map((element) => [
			element.textContent?.trim() ?? '',
			element.style.getPropertyValue('view-transition-name')
		])
	);
}

test('a re-sorted record travels under the same name before and after, and nothing else is named', async () => {
	// jsdom lays nothing out, so the viewport is given a height the virtualiser can fill.
	const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	const captured: Map<string, string>[] = [];
	const start = vi.fn((update: () => Promise<void> | void) => {
		// the browser captures the old state at the next frame and the new one once the update has
		// drawn, so each is read at that point rather than when the transition is asked for.
		const updated = new Promise((resolve) => setTimeout(resolve)).then(async () => {
			captured.push(namesOnScreen());
			await update();
			captured.push(namesOnScreen());
		});

		return {
			updateCallbackDone: updated,
			ready: updated,
			finished: updated.then(() => undefined),
			skipTransition: () => {}
		};
	});

	Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });

	try {
		const { rerender } = render(ListMotionHarness, { data: records('one', 'two', 'three') });

		await waitFor(() => expect(screen.getByText('three')).toBeTruthy());
		// nothing wears a name while the list is still.
		expect(namesOnScreen().size).toBe(0);

		await rerender({ data: records('three', 'one', 'two') });

		await waitFor(() => expect(captured).toHaveLength(2));
		const [before, after] = captured;

		expect([...before.keys()].sort()).toEqual(['one', 'three', 'two']);
		expect([...after.keys()].sort()).toEqual(['one', 'three', 'two']);
		for (const id of ['one', 'two', 'three']) {
			expect(before.get(id)).toMatch(/^list-/);
			expect(after.get(id)).toBe(before.get(id));
		}
		expect(new Set(after.values()).size).toBe(3);

		// and the names come off once the move is over.
		await waitFor(() => expect(namesOnScreen().size).toBe(0));
	} finally {
		height.mockRestore();
		width.mockRestore();
	}
});
