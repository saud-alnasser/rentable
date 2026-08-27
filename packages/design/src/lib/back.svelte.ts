import { goto } from '$app/navigation';
import { backTrail } from '#lib/back.js';

/**
 * The reactive face of {@link backTrail}. Owns nothing but the mirror — every decision is the
 * trail's, so what a back control reads here and what the tests exercise there cannot drift
 * apart.
 */
class Back {
	/** where back would return to, or `null` when there is nowhere to return to. */
	destination = $state<string | null>(null);

	constructor() {
		backTrail.observe(() => {
			this.destination = backTrail.previous;
		});
	}

	visit = (screen: string) => backTrail.visit(screen);

	forgetCurrent = () => backTrail.forgetCurrent();

	forget = (screen: string) => backTrail.forget(screen);

	/**
	 * Go back, or to `fallback` where there is nowhere to go back to. `fallback` arrives
	 * already resolved.
	 *
	 * Navigating rather than following a link, because the trail is the application's own and
	 * arriving is what tells it: a link would be indistinguishable from opening the screen
	 * afresh.
	 */
	// the destination is a path the router itself produced, so it is already resolved and the
	// base is already on it — resolving it a second time would put the base on twice.
	go = (fallback: string) => goto(this.destination ?? fallback);
}

/** what a record surface's back control reads. */
export const back = new Back();
