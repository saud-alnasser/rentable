import { type DesignDirection } from '#lib/strings.js';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import WayInHarness from '#tests/way-in-harness.svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, expect, test } from 'vitest';

/**
 * The surface every step before the application draws on, and what it does when the step changes.
 *
 * **The transition itself cannot be watched here.** jsdom has no `startViewTransition` and paints
 * nothing, so what these read is what the surface decides: whether it asks for a transition, what
 * it hands the browser to snapshot, and which way it says the contents move. The motion on screen
 * is the screenshot walk's, at the effort's close.
 */

type Harness = { step: string; at?: number; back?: boolean; onback?: () => void };

const draw = (props: Harness, direction: DesignDirection = 'ltr') =>
	render(WayInHarness, props, {
		wrapper: Providers,
		wrapperProps: { strings: suppliedStrings(), direction }
	});

type Started = { update: () => void | Promise<void>; frozen: string | null; shift: string };

/** a webview with view transitions, recording each one and running its update when told. */
function stubViewTransitions() {
	const started: Started[] = [];

	document.startViewTransition = ((run: () => void | Promise<void>) => {
		// as in a browser, the transition finishes only after its update has run.
		let finish = () => undefined as void;
		const finished = new Promise<void>((resolve) => (finish = resolve));

		started.push({
			update: async () => {
				await run();
				finish();
			},
			// what the browser would take its first snapshot of: read now, before the update runs.
			frozen: document.querySelector('[data-way-in-frozen]')?.textContent ?? null,
			shift: document.documentElement.style.getPropertyValue('--way-in-shift')
		});

		return {
			finished,
			ready: finished,
			updateCallbackDone: finished,
			skipTransition: () => undefined
		};
	}) as unknown as typeof document.startViewTransition;

	return started;
}

/** a webview where the reader has asked for less motion, or has not. */
function stubReducedMotion(reduces: boolean) {
	window.matchMedia = ((query: string) => ({
		matches: reduces && query === '(prefers-reduced-motion: reduce)',
		media: query,
		addEventListener: () => undefined,
		removeEventListener: () => undefined
	})) as unknown as typeof window.matchMedia;
}

afterEach(() => {
	delete (document as { startViewTransition?: unknown }).startViewTransition;
	delete (window as { matchMedia?: unknown }).matchMedia;
});

test('a step change keeps the mark and the title where they were, as the same nodes', async () => {
	const { rerender, container } = draw({ step: 'one', at: 1 });

	const mark = container.querySelector('[data-way-in-mark]');
	const title = container.querySelector('[data-way-in-title]');

	await rerender({ step: 'two', at: 2 });

	expect(mark).not.toBeNull();
	expect(container.querySelector('[data-way-in-mark]')).toBe(mark);
	expect(container.querySelector('[data-way-in-title]')).toBe(title);
	expect(title?.textContent?.trim()).toBe('title two');
});

test('a step change runs inside a view transition, over a copy of the step it leaves', async () => {
	const started = stubViewTransitions();
	const { rerender, container } = draw({ step: 'one', at: 1 });

	// drawing the first step is not a change.
	expect(started).toHaveLength(0);

	await fireEvent.input(screen.getByLabelText('field one'), {
		target: { value: 'what was typed' }
	});
	await rerender({ step: 'two', at: 2 });

	expect(started).toHaveLength(1);
	// the snapshot the browser takes first is of the old step, typed value and all.
	expect(started[0]!.frozen).toContain('title one');
	expect(started[0]!.frozen).not.toContain('title two');

	const copy = container.querySelector<HTMLElement>('[data-way-in-frozen]');

	expect(copy?.hasAttribute('inert')).toBe(true);
	expect(copy?.getAttribute('aria-hidden')).toBe('true');
	expect(copy?.querySelector('input')?.value).toBe('what was typed');
	expect(copy?.querySelector('[id], [name]')).toBeNull();

	// and the live step under it is already the new one, reachable and focusable.
	expect(screen.getByLabelText('field two')).toBeDefined();

	await started[0]!.update();

	expect(container.querySelector('[data-way-in-frozen]')).toBeNull();
});

test('without view transitions the new step is drawn directly, and nothing throws', async () => {
	expect(document.startViewTransition).toBeUndefined();

	const { rerender, container } = draw({ step: 'one' });

	await rerender({ step: 'two' });

	expect(container.querySelector('[data-way-in-title]')?.textContent?.trim()).toBe('title two');
	expect(container.querySelector('[data-way-in-frozen]')).toBeNull();
});

test('under reduced motion no transition is asked for', async () => {
	const started = stubViewTransitions();

	stubReducedMotion(true);

	const { rerender, container } = draw({ step: 'one' });

	await rerender({ step: 'two' });

	expect(started).toHaveLength(0);
	expect(container.querySelector('[data-way-in-title]')?.textContent?.trim()).toBe('title two');
	expect(container.querySelector('[data-way-in-frozen]')).toBeNull();
});

test('with motion allowed the same change is asked for', async () => {
	const started = stubViewTransitions();

	stubReducedMotion(false);

	const { rerender } = draw({ step: 'one' });

	await rerender({ step: 'two' });

	expect(started).toHaveLength(1);
});

test.each([
	['forward, left to right', 'ltr', 1, 2, '1'],
	['forward, right to left', 'rtl', 1, 2, '-1'],
	['a lower position, left to right', 'ltr', 2, 1, '-1'],
	['a lower position, right to left', 'rtl', 2, 1, '1']
] as const)(
	'the contents move the reading direction way: %s',
	async (_, direction, from, to, shift) => {
		const started = stubViewTransitions();
		const { rerender } = draw({ step: `at ${from}`, at: from }, direction);

		await rerender({ step: `at ${to}`, at: to });

		expect(started[0]?.shift).toBe(shift);
	}
);

test('back runs the change the other way, and only the change it caused', async () => {
	const started = stubViewTransitions();
	// the caller moves to the step before in its own handler, as the walk does.
	const drawn = draw({
		step: 'two',
		back: true,
		onback: () => void drawn.rerender({ step: 'one', back: false })
	});

	await fireEvent.click(screen.getByRole('button', { name: 'the way back' }));
	await tick();

	expect(started[0]?.shift).toBe('-1');

	// the next change is forward again.
	await started[0]!.update();
	await drawn.rerender({ step: 'three', back: false });

	expect(started[1]?.shift).toBe('1');
});

test('the direction is cleared once the transition has finished', async () => {
	const started = stubViewTransitions();
	const { rerender } = draw({ step: 'one' });

	await rerender({ step: 'two' });
	await started[0]!.update();
	await tick();
	await Promise.resolve();

	expect(document.documentElement.style.getPropertyValue('--way-in-shift')).toBe('');
	expect(document.documentElement.dataset.wayInMotion).toBeUndefined();
});

test('back is the shared control, 1rem in from the top-start corner, mirrored in Arabic', async () => {
	let pressed = 0;
	const { container } = draw({ step: 'one', back: true, onback: () => (pressed += 1) }, 'rtl');

	const corner = container.querySelector('[data-way-in-back]');
	const control = corner?.querySelector('[data-back-control]');

	expect(control).not.toBeNull();
	expect(corner?.classList).toContain('absolute');
	expect(corner?.classList).toContain('top-4');
	expect(corner?.classList).toContain('start-4');
	// the corner is the content area's: the surface's own box, not the column's.
	expect(corner?.parentElement?.hasAttribute('data-way-in-surface')).toBe(true);
	expect(control?.querySelector('svg')?.getAttribute('class')).toContain('rtl:rotate-180');

	await fireEvent.click(screen.getByRole('button', { name: 'the way back' }));

	expect(pressed).toBe(1);
});

test('back is drawn only where it is handed in', () => {
	const { container } = draw({ step: 'one' });

	expect(container.querySelector('[data-way-in-back]')).toBeNull();
	expect(container.querySelector('[data-back-control]')).toBeNull();
});

test('the column is placed from the top, and is not a card', () => {
	const { container } = draw({ step: 'one' });

	const column = container.querySelector('[data-way-in-mark]')?.parentElement;

	expect(column?.classList).toContain('pt-[max(5rem,20vh)]');
	expect(column?.classList).not.toContain('justify-center');
	expect(column?.classList).not.toContain('items-center');

	for (const element of container.querySelectorAll(
		'[data-way-in-surface], [data-way-in-surface] *'
	)) {
		const classes = element.getAttribute('class') ?? '';

		expect(classes).not.toMatch(/(?:^|\s)(?:bg-card|shadow-\S+|ring-\S+)(?:\s|$)/);
	}
});

test('the position is one small muted line above the title', () => {
	const { container } = draw({ step: 'one', at: 1 });

	const position = container.querySelector('[data-way-in-position]');
	const title = container.querySelector('[data-way-in-title]');

	expect(position?.textContent?.trim()).toBe('step 1 of 2');
	expect(position?.classList).toContain('text-xs');
	expect(position?.classList).toContain('text-muted-foreground');
	expect(
		position && title && position.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(container.querySelectorAll('[data-way-in-position]')).toHaveLength(1);
});

test('without a position nothing is drawn for one', () => {
	const { container } = draw({ step: 'one' });

	expect(container.querySelector('[data-way-in-position]')).toBeNull();
	expect(container.textContent).not.toMatch(/step \d of/);
});

test('a title is raised to sentence case, and a name is drawn as it is written', () => {
	const { container, unmount } = draw({ step: 'one' });

	expect(container.querySelector('[data-way-in-title]')?.classList).toContain(
		'first-letter:uppercase'
	);
	unmount();

	const named = draw({ step: 'one', named: true });

	expect(named.container.querySelector('[data-way-in-title]')?.classList).not.toContain(
		'first-letter:uppercase'
	);
});

test('the step, its actions and the foot are each in their place', () => {
	const { container } = draw({ step: 'one' });

	expect(container.querySelector('[data-way-in-body] input')).not.toBeNull();
	expect(container.querySelector('[data-way-in-actions]')?.textContent).toContain('go one');
	expect(container.querySelector('[data-way-in-foot]')?.textContent).toContain('language');
	// the foot is not part of what crosses on a step change.
	expect(container.querySelector('[data-way-in-content] [data-way-in-foot]')).toBeNull();
});
