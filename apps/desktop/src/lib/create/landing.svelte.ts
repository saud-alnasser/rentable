import { onNavigate } from '$app/navigation';

/**
 * WHERE A CREATE LANDS
 *
 * After a record is created the reader lands where the next step is ([[rules/interface]],
 * *Guidance*). A contract opens its own page, which is its host's to do. A tenant, a complex or a
 * payment is brought into view in the set that lists it, with the focus on it, which is the list's
 * to do: the host that made it does not know which set is on screen, and the set does not know
 * what was made. This is where the two meet.
 *
 * A module rather than a context, for the reason the create targets are one: the hosts are mounted
 * in the frame, and the lists are drawn by surfaces that share no ancestor with them.
 *
 * **A request is answered once or dropped.** Each list on screen answers it once, from the result
 * set it holds: the one holding the record takes it, and one that does not is done with it, so a
 * filter cleared later does not bring the record in then. The next navigation drops it, so a set
 * visited later does not move the focus either (effort 832, ticket 39).
 */

/** One create's request to be brought into view. An object, so landing one id twice is two. */
export type LandingRequest = { readonly id: string };

class Landing {
	/** the request lists answer, from the turn after `land` until one takes it or it is dropped. */
	pending = $state.raw<LandingRequest | null>(null);

	/** the latest request made, which a drop cancels even before it is posted. */
	#asked: LandingRequest | null = null;

	/**
	 * A create has made this record: the lists on screen answer whether they show it.
	 *
	 * Posted a turn later rather than at once. The create's refetch has landed by the time its host
	 * hears of it, but the query library tells its observers on a timer of its own, so a list asked
	 * at once would answer from the set it had before the create and turn the record away.
	 */
	land = (id: string) => {
		const request = { id };

		this.#asked = request;
		setTimeout(() => {
			if (this.#asked === request) {
				this.pending = request;
			}
		}, 0);
	};

	/** a list has brought this record into view, so no other list does. */
	take = (request: LandingRequest) => {
		if (this.#asked === request) {
			this.#asked = null;
		}

		if (this.pending === request) {
			this.pending = null;
		}
	};

	/** nothing is to be brought into view any more, whatever was asked. */
	drop = () => {
		this.#asked = null;
		this.pending = null;
	};
}

/** the session's one landing. */
export const landing = new Landing();

/**
 * Drop the landing request on every navigation. Called once, while the root layout initialises.
 *
 * A request the screen it was made on did not answer belongs to that screen. Answered by a set
 * the reader opens later, it would move the focus on a visit that had nothing to do with it.
 * Dropped as the navigation starts rather than once it ends, so the set it arrives at never reads
 * it.
 */
export function dropLandingOnNavigation() {
	onNavigate(() => {
		landing.drop();
	});
}

/** How long a list waits for a form to close before putting the focus on the record anyway. */
const SURFACE_WAIT_MS = 1000;

/**
 * Resolve once no dialog stands in the document.
 *
 * A form that made a record is still closing when the record arrives in its list, and a dialog
 * gives the focus back to what opened it once it has gone. Focusing the record before then would
 * have the focus taken straight back, so the list waits for the dialog to leave. It waits a
 * second at most: a dialog that stays is not one that is closing.
 */
export function whenSurfacesClose(root: Document = document): Promise<void> {
	const isClear = () => root.querySelector('[role="dialog"], [role="alertdialog"]') === null;

	return new Promise((resolve) => {
		if (isClear()) {
			resolve();

			return;
		}

		const settle = () => {
			observer.disconnect();
			clearTimeout(timer);
			// a turn later, because the dialog hands the focus back once it has gone.
			setTimeout(resolve, 0);
		};

		const observer = new MutationObserver(() => {
			if (isClear()) {
				settle();
			}
		});
		const timer = setTimeout(settle, SURFACE_WAIT_MS);

		observer.observe(root.body, { childList: true, subtree: true });
	});
}
