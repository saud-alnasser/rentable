import { tick, untrack } from 'svelte';

import { hasSameOrder, queueListMove, toClipPath } from './motion';

/**
 * LIST COMMIT
 *
 * The result set the rows are drawn from: `data`, committed rather than read.
 *
 * A change to `data` is not drawn the moment it arrives. It is committed here, inside a view
 * transition where it moves something and directly where it does not, so a record created
 * arrives, a record deleted leaves, an undone delete comes back in place and a re-sorted record
 * moves, rows the virtualiser adds or removes included. The pure half of the decision is
 * `motion.ts`; this is the half that is the document's.
 *
 * Constructed while the list initialises, since the commit is an effect of the list's own.
 */
export class ListCommit<TData extends { id: string }> {
	/**
	 * What the rows are drawn from. Raw, because the records are the query's objects and nothing
	 * here writes into them.
	 */
	displayed = $state.raw<TData[]>([]);
	/**
	 * Whether this list's records are what a transition in flight is capturing.
	 *
	 * The names are worn only for the length of this list's own transition. Worn always, another
	 * list on the same screen would have its records captured by this one's transition and clipped
	 * to this one's frame.
	 */
	isMoving = $state(false);

	/** What the last commit asked for, which a transition draws once it gets to: always the latest. */
	#committing: TData[];
	/**
	 * Whether the next change to `data` is the answer to this list's own search.
	 *
	 * Set at the moment the block writes `search`, and spent by the change that answers it. A
	 * keystroke narrows what the reader is looking at, and records sliding under the letters would
	 * be motion on a path used many times a minute, so that change is drawn at once. Plain rather
	 * than state: it is read and written inside the commit and nothing draws it.
	 */
	#isAwaitingSearch = false;
	/** Whether the list was still waiting for its first result set when `data` last moved. */
	#wasLoading: boolean;
	/**
	 * Whether this list has a move waiting its turn. The waiting move draws whatever was committed
	 * last when it starts, so a change arriving meanwhile needs no move of its own.
	 */
	#isQueued = false;
	/** The element the records are clipped to while they move. */
	#frame: () => HTMLElement | null;

	constructor(read: {
		data: () => TData[];
		isLoading: () => boolean;
		frame: () => HTMLElement | null;
	}) {
		this.displayed = untrack(read.data);
		this.#committing = untrack(read.data);
		this.#wasLoading = untrack(read.isLoading);
		this.#frame = read.frame;

		// every change to `data` passes through here, and only a change that moves something moves.
		$effect(() => {
			const next = read.data();
			const loading = read.isLoading();

			untrack(() => {
				// the first result set is the list appearing, not records arriving in it. Read across two
				// passes, because the set lands in the same update that ends the loading.
				const isFirstArrival = this.#wasLoading || loading;
				this.#wasLoading = loading;

				if (next === this.#committing) {
					return;
				}

				const isSearchAnswer = this.#isAwaitingSearch;
				this.#isAwaitingSearch = false;

				if (isFirstArrival || isSearchAnswer || hasSameOrder(this.#committing, next)) {
					this.#committing = next;
					this.displayed = next;

					return;
				}

				this.#commitMoving(next);
			});
		});
	}

	/** The list's own search is about to move: its answer is drawn at once. */
	awaitSearch = () => {
		this.#isAwaitingSearch = true;
	};

	/**
	 * Draw `next` inside a same-document view transition, and directly where the webview has none.
	 *
	 * The document itself is not captured while this runs: its `view-transition-name` is taken away
	 * for the length of the transition, so the root snapshot does not animate and everything around
	 * the records stays live under the pointer. Only the records are captured, and their layer is
	 * clipped to the frame, since it is drawn above the whole document and the frame's own clip does
	 * not reach it.
	 */
	#commitMoving(next: TData[]) {
		this.#committing = next;

		if (typeof document.startViewTransition !== 'function' || !this.#frame()) {
			this.displayed = next;

			return;
		}

		if (this.#isQueued) {
			return;
		}

		// in turn with every other list's moves, since the document holds one transition and one
		// mark at a time (`queueListMove`).
		this.#isQueued = true;
		void queueListMove(() => {
			this.#isQueued = false;

			return this.#move();
		});
	}

	/** Start this list's transition, now that no other is running, and settle once it ends. */
	async #move() {
		const frame = this.#frame();

		// the frame left while the move waited, or a direct commit drew the latest set meanwhile.
		if (!frame?.isConnected || this.displayed === this.#committing) {
			this.displayed = this.#committing;

			return;
		}

		const root = document.documentElement;

		this.isMoving = true;
		root.style.setProperty(
			'--list-motion-clip',
			toClipPath(frame.getBoundingClientRect(), getComputedStyle(frame).borderTopLeftRadius)
		);
		root.dataset.listMotion = '';

		try {
			// the old state is captured at the next frame, after the microtask that draws
			// `isMoving`, so the names are on the records by then.
			const transition = document.startViewTransition(async () => {
				this.displayed = this.#committing;
				await tick();
			});

			await transition.finished;
		} finally {
			this.isMoving = false;
			delete root.dataset.listMotion;
			root.style.removeProperty('--list-motion-clip');
		}
	}
}
