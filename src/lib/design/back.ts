/**
 * BACK
 *
 * where the reader has been inside the application, so a back control can return them there
 * rather than to a fixed place.
 *
 * It is the application's own trail and not the browser's, for two reasons. A record deleted
 * from its own page is still in the browser's history, and returning to it would land on a
 * record that is no longer there — this one is told, and forgets. And a screen is a path
 * here: the section of a detail view is a query parameter, and moving between the sections of
 * a record is not leaving it.
 */

/** How many screens back may reach before the oldest is dropped. */
const DEPTH = 50;

/** A screen, as the trail keys one: the path and nothing after it. */
export function toScreen(url: { pathname: string }) {
	return url.pathname;
}

export class BackTrail {
	#visited: string[] = [];
	#observers = new Set<() => void>();

	/** where the reader is now, or `null` before anything has been visited. */
	get current(): string | null {
		return this.#visited.at(-1) ?? null;
	}

	/** where back would return to, or `null` when there is nowhere to return to. */
	get previous(): string | null {
		return this.#visited.at(-2) ?? null;
	}

	/** register a listener called after every change. Returns its own removal. */
	observe(observer: () => void) {
		this.#observers.add(observer);

		return () => this.#observers.delete(observer);
	}

	/**
	 * Record where the reader has arrived.
	 *
	 * Arriving where they already are adds nothing, and arriving where they were *before*
	 * takes one off rather than adding — going back is the trail being walked, not extended.
	 * Without that a reader moving between two screens would grow the trail with every press
	 * and each screen would point at the other for ever.
	 */
	visit(screen: string) {
		if (this.current === screen) {
			return;
		}

		if (this.previous === screen) {
			this.#visited.pop();
			this.#notify();

			return;
		}

		this.#visited.push(screen);
		this.#visited = this.#visited.slice(-DEPTH);
		this.#notify();
	}

	/**
	 * Forget every visit to a screen, wherever it sits.
	 *
	 * Called when the record it showed is deleted: what is left is where the reader was before
	 * it, which is where back should now go.
	 */
	forget(screen: string) {
		const remaining = this.#visited.filter((visited) => visited !== screen);

		if (remaining.length === this.#visited.length) {
			return;
		}

		this.#visited = remaining;
		this.#notify();
	}

	/** Forget the screen the reader is on — the record they have just deleted. */
	forgetCurrent() {
		if (this.current) {
			this.forget(this.current);
		}
	}

	#notify() {
		for (const observer of this.#observers) {
			observer();
		}
	}
}

/**
 * the session's one trail.
 *
 * A module rather than a per-screen instance because it answers a question every record
 * surface asks, and the answer outlives all of them. It sits here rather than in the shell
 * because the surfaces that read it are the concepts', which is what `design` is for.
 */
export const backTrail = new BackTrail();
