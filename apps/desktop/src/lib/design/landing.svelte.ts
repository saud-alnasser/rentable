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
 */
class Landing {
	/**
	 * the record a create has just made, waiting for a list showing it. It stays until a list takes
	 * it or another create replaces it, so a record made before its set is on screen is still
	 * brought into view when the set arrives.
	 */
	pending = $state<string | null>(null);

	/** a create has made this record: the next list showing it brings it into view. */
	land = (id: string) => {
		this.pending = id;
	};

	/** a list has brought this record into view, so no other list does. */
	take = (id: string) => {
		if (this.pending === id) {
			this.pending = null;
		}
	};
}

/** the session's one landing. */
export const landing = new Landing();

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
