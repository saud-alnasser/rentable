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

/** whether the reader asked for less motion, read at the moment of the crossing. */
function reducesMotion() {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Start the crossing, and answer what SvelteKit's `onNavigate` waits on: a promise that settles
 * once the browser has its snapshot of the screen being left, so the navigation goes on inside
 * the transition. `undefined` where nothing is run, which `onNavigate` reads as go on at once.
 *
 * `complete` is the navigation's own `complete`, which the transition's update waits on so the
 * new screen is what the browser snapshots next.
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

	// forward in a left-to-right reading is 1, as on the surface: the outgoing leave toward the
	// start and the incoming arrive from the end. Arabic and back each turn it round.
	const shift = (direction === 'rtl' ? -1 : 1) * (crossing === 'back' ? -1 : 1);
	const root = document.documentElement;

	root.style.setProperty('--way-in-shift', String(shift));
	root.dataset.wayInMotion = '';

	return new Promise((resolve) => {
		const transition = document.startViewTransition(async () => {
			resolve();
			await complete;
		});

		void transition.finished.finally(() => {
			root.style.removeProperty('--way-in-shift');
			delete root.dataset.wayInMotion;
		});
	});
}
