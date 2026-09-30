/** What is held, and a run added to it, each id once and in the order it was first held. */
function union(held: readonly string[], run: readonly string[]) {
	return [...new Set([...held, ...run])];
}

/**
 * LIST SELECTION
 *
 * Selection is a mode the reader turns on, not a set of controls every list wears. A checkbox
 * against every row on every screen is a permanent invitation to an action almost nobody is
 * taking, and it costs the rows their alignment to carry it.
 *
 * What is selected is the list's `selected` prop, by id, so this reads and writes it through the
 * two functions it is handed rather than holding a copy.
 */
export class ListSelection {
	/** Whether the reader has turned selecting on. */
	isSelecting = $state(false);
	/**
	 * Where a run starts from: the last record the reader picked without holding shift. Reset
	 * whenever the selection is emptied, so a run never reaches back to a record from before.
	 */
	runAnchor = $state<string | null>(null);
	/**
	 * Whether shift was held. Read at the moment of the change rather than from the event, because
	 * the checkbox reports its new state and not what was held down to produce it.
	 */
	isExtending = $state(false);

	#read: {
		selected: () => string[];
		selectedIds: () => ReadonlySet<string>;
		select: (ids: string[]) => void;
		orderedIds: () => string[];
		offered: () => boolean;
	};

	/** Whether the list offers selecting and the reader has turned it on. */
	isSelectable = $derived.by(() => this.#read.offered() && this.isSelecting);

	constructor(read: {
		/** the ids selected, as the list holds them. */
		selected: () => string[];
		/** the same, as a set to ask of. */
		selectedIds: () => ReadonlySet<string>;
		/** replace them. */
		select: (ids: string[]) => void;
		/**
		 * The ids in the order the list is showing them, which is what a run between two records
		 * means: the order on screen.
		 */
		orderedIds: () => string[];
		/** whether the surface hands the list anything to do to a selection. */
		offered: () => boolean;
	}) {
		this.#read = read;
	}

	/** The ids selected, as a set to ask of. */
	get selectedIds() {
		return this.#read.selectedIds();
	}

	/** Take a record in or out of the selection, extending from the anchor while shift is held. */
	choose = (id: string) => {
		const selected = this.#read.selected();
		const orderedIds = this.#read.orderedIds();

		if (this.isExtending && this.runAnchor !== null) {
			const from = orderedIds.indexOf(this.runAnchor);
			const to = orderedIds.indexOf(id);

			if (from !== -1 && to !== -1) {
				const run = orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);

				// added to what is held rather than replacing it: a reader assembling a selection out
				// of several runs is doing something ordinary, and a run that cleared the rest would
				// throw away the work between them.
				this.#read.select(union(selected, run));

				return;
			}
		}

		this.runAnchor = id;
		this.#read.select(
			this.selectedIds.has(id) ? selected.filter((held) => held !== id) : [...selected, id]
		);
	};

	/** Note whether shift is held, at the moment a checkbox is pressed. */
	holdShift = (isHeld: boolean) => {
		this.isExtending = isHeld;
	};

	/** Put the whole selection down. */
	clear = () => {
		this.#read.select([]);
		this.runAnchor = null;
	};

	/**
	 * Turn the mode on or off. Leaving it puts the selection down with it: a set held invisibly is
	 * a set the next action would act on by surprise.
	 */
	toggle = () => {
		this.isSelecting = !this.isSelecting;

		if (!this.isSelecting) {
			this.clear();
		}
	};
}
