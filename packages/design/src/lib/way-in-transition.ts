import { reducesMotion } from '#lib/reduces-motion.js';

/**
 * A route change between two screens of the way in, run as the way-in surface runs a step change.
 *
 * The welcome and the first run are two addresses, and so are the welcome and the join, but to a
 * person they are one surface changing step: the mark and the title hold still and the contents
 * move in the reading direction (effort 843, requirement 4). Both screens draw the way-in surface,
 * whose mark and contents carry the same view-transition names on every screen, so a document
 * transition around the navigation is all it takes; this is that transition, started from the
 * application's `onNavigate`, which is the application's to call because the addresses are.
 *
 * `--way-in-shift` and `data-way-in-motion` are what the surface's own styles read (its `<style>`
 * block), set for the length of the transition and cleared after, exactly as a step change sets
 * them. The token layer's reduced-motion block covers the names, and the transition is not asked
 * for at all under reduced motion or where the browser has none.
 */

/** which way a crossing runs: into a walk, or back out of one. */
export type WayInCrossing = 'forward' | 'back';

/** which transition last put its direction on the root, so an earlier one does not take it off. */
let holder = 0;

/**
 * Put a transition's direction on the root, and answer what takes it off again.
 *
 * **Only the transition that put it there takes it off.** A route crossing and a step change both
 * write the same two things, and the outgoing screen's surface is unmounted at the navigation's
 * `complete`, in the middle of the crossing. A surface that cleared the root then left the
 * keyframes on their fallback, and Arabic and back slid the wrong way. So each hold is numbered,
 * the number is what `data-way-in-motion` holds, and a release whose number is no longer there
 * does nothing.
 *
 * `shift` is 1 for forward in a left-to-right reading, the outgoing leaving toward the start and
 * the incoming arriving from the end; Arabic and back each turn it round.
 */
export function holdWayInMotion(shift: number): () => void {
	const root = document.documentElement;
	const mine = String(++holder);

	root.style.setProperty('--way-in-shift', String(shift));
	root.dataset.wayInMotion = mine;

	return () => {
		if (root.dataset.wayInMotion !== mine) return;

		root.style.removeProperty('--way-in-shift');
		delete root.dataset.wayInMotion;
	};
}

/**
 * Start the crossing, and answer what SvelteKit's `onNavigate` waits on: a promise that settles
 * once the browser has its snapshot of the screen being left, so the navigation goes on inside
 * the transition. `undefined` where nothing is run, which `onNavigate` reads as go on at once.
 *
 * `complete` is the navigation's own `complete`, which the transition's update waits on so the
 * new screen is what the browser snapshots next. **A navigation that is cancelled or fails
 * rejects it**, and the update with it, so the browser skips the animation and `finished` and
 * `updateCallbackDone` reject. Both are taken here: the root is cleared either way, and nothing is
 * left to surface as an unhandled rejection. Saying the navigation failed is SvelteKit's.
 */
export function crossWayIn(
	crossing: WayInCrossing,
	direction: 'ltr' | 'rtl',
	complete: Promise<unknown>
): Promise<void> | undefined {
	if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
		return undefined;
	}

	if (reducesMotion()) {
		return undefined;
	}

	// forward in a left-to-right reading is 1, as on the surface.
	const release = holdWayInMotion((direction === 'rtl' ? -1 : 1) * (crossing === 'back' ? -1 : 1));

	return new Promise((resolve) => {
		const transition = document.startViewTransition(async () => {
			resolve();
			await complete;
		});

		void transition.finished.then(release, release);
		void transition.updateCallbackDone.catch(() => undefined);
	});
}
