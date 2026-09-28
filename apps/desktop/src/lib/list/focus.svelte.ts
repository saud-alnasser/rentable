import type { ListGroup, ListRow } from '@rentable/design/group.js';
import { isEditingText } from '@rentable/design/shortcut.js';
import type { createVirtualizer, VirtualItem } from '@tanstack/svelte-virtual';
import { tick, untrack } from 'svelte';
import { get } from 'svelte/store';

import { landing, whenSurfacesClose, type LandingRequest } from '$lib/create';
import { shortcuts } from '$lib/shortcut';

import {
	nextPosition,
	toListMovement,
	toListShortcuts,
	toPositionOf,
	type ListMovement,
	type ListPosition,
	type ListRecordRow
} from './keyboard';

type Virtualizer = ReturnType<typeof createVirtualizer<HTMLElement, HTMLElement>>;

// the record's own link, which `record-card` documents as the card's single tab stop. The
// query is written as what the browser would tab to rather than as `a`, so a record that is
// opened by a button rather than by a link is reached by the same move.
const RECORD_TAB_STOP = 'a[href], button, [tabindex]:not([tabindex="-1"])';

/**
 * LIST FOCUS
 *
 * Where the keyboard is in a list, and where a record just created lands in it: the half of
 * `keyboard.ts` that is the DOM's, which element takes focus and when it exists to take it.
 *
 * Constructed while the list initialises, after its virtualizer, since each of these is an
 * effect of the list's own and they run in the order they are written.
 */
export class ListFocus<TData extends { id: string }, TGroup extends ListGroup> {
	/**
	 * Which record the keyboard is on. It is a place in the layout rather than a record, because a
	 * resize relays the same records across a different number of columns and the reader's finger
	 * stays where it was on the screen.
	 */
	focused = $state<ListPosition | null>(null);
	/** A move whose element is not in the document yet. See the effect that answers it. */
	#awaitingFocus = $state<ListPosition | null>(null);
	/**
	 * The landing request this list has answered, so it answers each one once. Plain rather than
	 * state: it is read and written inside the answer and nothing draws it.
	 */
	#answeredLanding: LandingRequest | null = null;
	/** A record this list took, waiting for its row to be drawn. */
	#arriving = $state<string | null>(null);

	#virtualizer: Virtualizer;
	#recordRows: () => ListRecordRow[];
	#direction: () => 'ltr' | 'rtl';

	constructor(read: {
		virtualizer: Virtualizer;
		data: () => TData[];
		isLoading: () => boolean;
		rows: () => ListRow<TData, TGroup>[];
		recordRows: () => ListRecordRow[];
		virtualRows: () => VirtualItem[];
		viewport: () => HTMLElement | null;
		direction: () => 'ltr' | 'rtl';
		/** what makes a new list: the search, the order and the narrowing. */
		reads: () => unknown[];
		/** put down what the reader held in the list that was there before. */
		onNewList: () => void;
	}) {
		const virtualizer = read.virtualizer;

		this.#virtualizer = virtualizer;
		this.#recordRows = read.recordRows;
		this.#direction = read.direction;

		// a new order is a new list: the row under the pointer is not the row that was there, so
		// staying at the old offset would leave the user somewhere they never scrolled to. The
		// keyboard's place goes with it, for the same reason.
		$effect(() => {
			// and a narrowing is a new list for the same reason: the rows the read returns are a
			// different set, so the row the keyboard was on may not be among them.
			void read.reads();

			this.focused = null;
			// the selection goes too. It is a set of records the reader picked out of what they could
			// see, and once the read returns something else it holds records that are no longer on
			// screen — acting on those is acting on records nobody is looking at.
			read.onNewList();

			void tick().then(() => {
				get(virtualizer).scrollToOffset(0);
			});
		});

		// registered rather than listened for: the sheet reads both from here without being told about
		// them. The search key is the search field's, which registers it wherever a set is searched.
		$effect(() => shortcuts.register(...toListShortcuts()));

		// the standing request, answered the moment the row it names is rendered. Reading the rendered
		// window is what makes that happen: a scroll moves it, this runs again, and the focus lands —
		// which is also what carries it across the boundary where rows are recycled.
		$effect(() => {
			void read.virtualRows();

			const awaitingFocus = this.#awaitingFocus;
			const viewport = read.viewport();

			if (!awaitingFocus || !viewport) {
				return;
			}

			const cell = viewport.querySelector(
				`[data-index="${awaitingFocus.row}"] [data-record="${awaitingFocus.column}"]`
			);
			const stop = cell?.querySelector<HTMLElement>(RECORD_TAB_STOP);

			if (!stop) {
				return;
			}

			stop.focus();
			this.#awaitingFocus = null;
		});

		// a record just created is answered for here, once, from the set this list holds
		// ([[rules/interface]], *Guidance*). Holding it, the list takes it at once, so a second list
		// showing the same record does not answer too. Not holding it, the list is done with it: a
		// later change bringing the record in, a filter cleared say, is not the create it answers.
		$effect(() => {
			const request = landing.pending;

			// a set still loading has nothing to answer from yet.
			if (!request || read.isLoading()) {
				return;
			}

			const isHeld = read.data().some((item) => item.id === request.id);

			untrack(() => {
				if (this.#answeredLanding === request) {
					return;
				}

				this.#answeredLanding = request;

				if (isHeld) {
					landing.take(request);
					this.#arriving = request.id;
				}
			});
		});

		// the record taken, brought into view once its row is drawn, and the focus put on it once the
		// form that made it has gone, through the same standing request a move raises. The row can be a
		// transition behind the result set, which is why this waits on `rows` rather than on `data`.
		$effect(() => {
			const id = this.#arriving;

			if (!id) {
				return;
			}

			// gone again before it was drawn, so there is nothing to land on.
			if (!read.data().some((item) => item.id === id)) {
				this.#arriving = null;

				return;
			}

			const position = toPositionOf(read.rows(), id);

			if (!position) {
				return;
			}

			untrack(() => {
				this.#arriving = null;
				get(virtualizer).scrollToIndex(position.row, { align: 'center' });

				void whenSurfacesClose().then(() => {
					this.focused = position;
					this.#awaitingFocus = position;
					get(virtualizer).scrollToIndex(position.row, { align: 'auto' });
				});
			});
		});
	}

	/**
	 * Answer a move by putting the focus on the record it lands on.
	 *
	 * The row is scrolled to rather than the element being relied on to bring itself into view: a
	 * move out of the search field can land many rows from whatever the reader had scrolled to,
	 * and a row outside the rendered window has no element to focus at all. Which is why the
	 * request is left standing rather than dropped — the effect above answers it once the row is
	 * laid out.
	 */
	#moveFocus(movement: ListMovement) {
		const next = nextPosition(this.#recordRows(), this.focused, movement);

		if (!next) {
			return;
		}

		this.focused = next;
		this.#awaitingFocus = next;
		get(this.#virtualizer).scrollToIndex(next.row);
	}

	handleKeydown = (event: KeyboardEvent) => {
		const movement = toListMovement(event.key, this.#direction());

		if (!movement) {
			return;
		}

		// inside the search field the sideways arrows are the caret's, and taking them would leave
		// the reader unable to move through what they typed. Up and down have nowhere else to go on
		// one line of text, so they are how the reader gets from the field into the records.
		if (isEditingText(event.target) && movement !== 'up' && movement !== 'down') {
			return;
		}

		// what the arrows would otherwise do is scroll the viewport out from under the focus.
		event.preventDefault();
		this.#moveFocus(movement);
	};
}
