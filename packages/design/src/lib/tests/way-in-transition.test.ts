import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { crossWayIn } from '#lib/way-in-transition.ts';

/**
 * THE WAY IN, CROSSING AN ADDRESS
 *
 * Effort 843, requirement 4 and ticket 06: a route change between two screens of the way in runs
 * inside one view transition, feature-detected, in the reading direction, and not at all under
 * reduced motion. The browser is stubbed with what the module reads of it and nothing more.
 */

type Stub = {
	started: number;
	updated: boolean;
	finish: () => void;
	root: { style: Map<string, string>; dataset: Record<string, string> };
};

const original = { document: globalThis.document, matchMedia: globalThis.matchMedia };

/** a document with a root and, unless told otherwise, view transitions. */
function stubBrowser({ transitions = true, reduces = false } = {}): Stub {
	let finish = () => {};
	const root = { style: new Map<string, string>(), dataset: {} as Record<string, string> };
	const stub: Stub = { started: 0, updated: false, finish: () => finish(), root };

	globalThis.document = {
		documentElement: {
			style: {
				setProperty: (name: string, value: string) => void root.style.set(name, value),
				removeProperty: (name: string) => void root.style.delete(name)
			},
			dataset: root.dataset
		},
		startViewTransition: transitions
			? (update: () => Promise<void>) => {
					stub.started++;

					const finished = new Promise<void>((resolve) => (finish = resolve));

					void update().then(() => (stub.updated = true));

					return { finished };
				}
			: undefined
	} as unknown as Document;
	globalThis.matchMedia = ((query: string) => ({
		matches: reduces && query.includes('reduce')
	})) as unknown as typeof matchMedia;

	return stub;
}

afterEach(() => {
	globalThis.document = original.document;
	globalThis.matchMedia = original.matchMedia;
});

test('a crossing runs inside a view transition and waits on the navigation in its update', async () => {
	const browser = stubBrowser();
	let arrive = () => {};
	const complete = new Promise<void>((resolve) => (arrive = resolve));

	const waiting = crossWayIn('forward', 'ltr', complete);

	assert.ok(waiting, 'a promise for onNavigate to wait on');
	await waiting;
	assert.equal(browser.started, 1);
	// the update is still waiting on the navigation, so the new screen is what gets snapshotted.
	assert.equal(browser.updated, false);

	arrive();
	await complete;
	await Promise.resolve();
	assert.equal(browser.updated, true);
});

test('the shift carries the reading direction and the way the crossing runs, and is cleared after', async () => {
	for (const [crossing, direction, shift] of [
		['forward', 'ltr', '1'],
		['back', 'ltr', '-1'],
		['forward', 'rtl', '-1'],
		['back', 'rtl', '1']
	] as const) {
		const browser = stubBrowser();

		await crossWayIn(crossing, direction, Promise.resolve());

		assert.equal(browser.root.style.get('--way-in-shift'), shift, `${crossing} ${direction}`);
		assert.equal('wayInMotion' in browser.root.dataset, true);

		browser.finish();
		await new Promise((resolve) => setTimeout(resolve, 0));

		assert.equal(browser.root.style.has('--way-in-shift'), false);
		assert.equal('wayInMotion' in browser.root.dataset, false);
	}
});

test('without view transitions, or under reduced motion, nothing is asked for', () => {
	const without = stubBrowser({ transitions: false });

	assert.equal(crossWayIn('forward', 'ltr', Promise.resolve()), undefined);
	assert.equal(without.root.style.size, 0);

	const reduced = stubBrowser({ reduces: true });

	assert.equal(crossWayIn('forward', 'ltr', Promise.resolve()), undefined);
	assert.equal(reduced.started, 0);
});
