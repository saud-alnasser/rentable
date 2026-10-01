import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { crossWayIn, holdWayInMotion } from '#lib/way-in-transition.ts';

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

					const updateCallbackDone = update().then(() => void (stub.updated = true));

					// as in a browser: an update that rejects rejects both of these.
					return {
						finished: Promise.all([finished, updateCallbackDone]).then(() => undefined),
						updateCallbackDone
					};
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

// ticket 14: a navigation that is cancelled or fails rejects its `complete`, which rejects the
// transition's update, and with it `finished` and `updateCallbackDone`.
test('a navigation that fails clears the root, and leaves no rejection unhandled', async () => {
	const escaped: unknown[] = [];
	const listen = (reason: unknown) => void escaped.push(reason);

	process.on('unhandledRejection', listen);

	try {
		const browser = stubBrowser();
		const complete = Promise.reject(new Error('navigation cancelled'));

		// SvelteKit handles its own `complete`; only what the crossing hangs off it is asked about.
		complete.catch(() => undefined);

		await crossWayIn('back', 'rtl', complete);

		browser.finish();
		await new Promise((resolve) => setTimeout(resolve, 10));

		assert.equal(browser.root.style.has('--way-in-shift'), false);
		assert.equal('wayInMotion' in browser.root.dataset, false);
		assert.deepEqual(escaped, []);
	} finally {
		process.off('unhandledRejection', listen);
	}
});

// ticket 14: a step change and a route crossing write the same two things on the root, and the
// one that ends first must not take off what the other put there.
test('only the transition that put the direction on the root takes it off', () => {
	const browser = stubBrowser();
	const surface = holdWayInMotion(1);
	const crossing = holdWayInMotion(-1);

	surface();

	assert.equal(browser.root.style.get('--way-in-shift'), '-1');
	assert.equal('wayInMotion' in browser.root.dataset, true);

	crossing();

	assert.equal(browser.root.style.has('--way-in-shift'), false);
	assert.equal('wayInMotion' in browser.root.dataset, false);
});
