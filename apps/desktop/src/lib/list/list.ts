import type { ExportColumn } from '@rentable/design/csv.js';
import type { ListGroup } from '@rentable/design/group.js';
import type { ListSort } from '@rentable/design/sort.js';
import type { Snippet } from 'svelte';

import type { FilterSelection, ListFilter } from './filter';

/**
 * LIST
 *
 * What a surface hands the list: the records, how one renders, and what the set offers. The list
 * itself is `component/list.svelte`, which takes exactly these props.
 */

/**
 * The narrowest a record laid as a tile may be, in pixels: what a list that lays its records in a
 * grid passes as `recordMinWidth`. One width for every grid, so the four directories break to two
 * columns and to three at the same window widths.
 */
export const RECORD_TILE_MIN_WIDTH = 300;

/**
 * How many tiles fit across `width`, each at least `min` wide with `gap` between them, and never
 * more than `max`.
 *
 * The gap is counted because it is space no tile has: two tiles of the minimum width do not fit in
 * twice that width once there is a gap between them, and counting without it drew tiles narrower
 * than the narrowest they may be. The cap is three because a fourth column on a wide window makes
 * each record a strip again, and three is what a reader scans across before reading down
 * ([[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 18).
 */
export function columnsFor(width: number, min: number, gap: number, max = 3): number {
	const fit = Math.floor((width + gap) / (min + gap));

	return Math.min(Math.max(1, fit), Math.max(1, max));
}

/** One order the set offers the reader, keyed by what the set orders by. */
export type ListSortOption = {
	/** The column's id, which is what the set orders by. */
	id: string;
	/** The name the sort control lists it under. */
	label: string;
};

export type ListProps<TData extends { id: string }, TGroup extends ListGroup> = {
	/** The whole result set for the current search and sort, in the query's own order. */
	data: TData[];
	/** One record, as the concept that owns the data renders it. */
	record: Snippet<[TData]>;
	/**
	 * Which group a record belongs to. Records must already arrive in an order that puts a
	 * group's records together — the shell reads the order, it never imposes one.
	 */
	groupOf?: (record: TData) => TGroup;
	/**
	 * A group's header, rendered as its own row above the records it opens.
	 *
	 * It scrolls with them rather than pinning to the top of the viewport: the records are cards
	 * with space between them, and a header pinned over them is a third surface floating above a
	 * list that reads in two. Separation comes from the header being a different kind of card,
	 * not from it staying in view.
	 */
	groupHeader?: Snippet<[TGroup]>;
	/** The orders the reader may choose between. A list that offers none gets no control. */
	sortOptions?: readonly ListSortOption[];
	/** The order the query is using, or `null` for the list's own. */
	sort?: ListSort | null;
	/** The search the query filters by, already debounced by this block. */
	search?: string;
	/** Whether the first result set for this list is still on its way. */
	isLoading?: boolean;
	/**
	 * Whether a later result set is on its way. The block keeps rendering `data` while it
	 * is, so the caller's query must hold the previous set — otherwise `data` empties and
	 * the list flashes through its loading state on every search keystroke.
	 */
	isFetching?: boolean;
	/**
	 * Ask the concept's host for its create form, where the list can take a record. Given it, the
	 * list draws the create control last in its toolbar, and answers the create key while it is
	 * on screen.
	 */
	onCreate?: () => void;
	/**
	 * What the create makes, in the concept's words: "new tenant", never "new record". Given
	 * with `onCreate`, and read by the toolbar's control and the empty state's act alike.
	 */
	createLabel?: string;
	/**
	 * Why the set takes no new record right now, in one line, or nothing where it does. The create
	 * control stays drawn, refused, and says it on hover and focus, as the key does.
	 */
	createUnavailable?: string;
	/**
	 * The narrowings this list offers, declared rather than drawn.
	 *
	 * Search and order are every list's and are this block's own; what a list may be narrowed
	 * *by* is the concept's — a contract has an attention rank and a tenant has nothing like
	 * one. So the concept says what it offers and the block draws all of them the same way,
	 * exactly as `sortOptions` and `sort` already work. This slot used to be a snippet, and
	 * the one surface that filled it built its own control; every list offering a filter that
	 * way would have looked like a different application on each screen.
	 */
	filterOptions?: readonly ListFilter[];
	/**
	 * What the list is narrowed to — a filter's id against the value chosen for it.
	 *
	 * The value reaches the concept's read and the narrowing happens there. Nothing in this
	 * block ever shortens `data`: a filter over what was loaded answers a different question
	 * than a filter over what exists, and [[rules/data]], under *List reads*, forbids it.
	 */
	filters?: FilterSelection;
	/**
	 * What an export writes, and what to call the file.
	 *
	 * The columns are the row's own, supplied by the concept that renders it: an export
	 * written from the query behind the list would put fields on disk the reader never
	 * chose to see. A list that names none offers no export.
	 */
	exportAs?: {
		name: string;
		columns: ExportColumn<TData>[];
	};
	/**
	 * How tall one record renders, in pixels. Rows are laid out at this height rather than
	 * measured, which keeps the geometry exact for a presentation whose records are all the
	 * same shape. A record that renders taller is clipped, not overlapped — raise this
	 * rather than letting the snippet decide its own height.
	 */
	recordHeight?: number;
	/** The same, for a group header. */
	groupHeaderHeight?: number;
	/**
	 * The narrowest a record may render, in pixels. A list that sets it lays records out
	 * across the viewport rather than one to a line, fitting as many columns of at least
	 * this width as there is room for, gaps counted and three at most (`columnsFor`), so the
	 * layout reflows on a resize instead of scrolling sideways. A list that leaves it unset is
	 * one record wide. A grid list passes `RECORD_TILE_MIN_WIDTH` and draws its records as tiles.
	 */
	recordMinWidth?: number;
	/**
	 * Read a file into this list.
	 *
	 * Given it, the toolbar's menu gains an import group beside the export one. What a file
	 * means is the concept's — which columns it reads, what makes a row valid, and what the
	 * write is — so this only says that the direction exists here.
	 */
	onImport?: () => void;
	/**
	 * Why this list takes no file right now, in one line, or nothing where it does. The import
	 * stays in the menu, refused, and says it on hover and focus, as the create control does
	 * ([[rules/interface]], *Guidance*).
	 */
	importUnavailable?: string;
	/**
	 * What the surface offers for the records currently selected.
	 *
	 * Giving it is what turns selection on: a list with nothing to do to several records at
	 * once has no reason to offer selecting them. The snippet is handed the ids in the order
	 * the list is showing them, and the concept owns the controls and whatever they confirm.
	 */
	selectionActions?: Snippet<[readonly string[]]>;
	/**
	 * The records selected, by id.
	 *
	 * By id rather than by position, which is what lets a selection survive a virtualized list
	 * scrolling past it: the row is unmounted and re-created, and the id is the one thing about
	 * it that does not change.
	 */
	selected?: string[];
	/**
	 * What the list says where it holds nothing yet: the concept's own words for what it will
	 * hold. Required, because a list that holds nothing is not a search that found nothing, and
	 * only the concept can say which records belong here ([[rules/interface]], *Empty*).
	 */
	emptyTitle: string;
	/** A line under it, saying where the records come from. */
	emptyDescription?: string;
	/**
	 * Whether the read behind `data` failed with nothing to show, as `toReadFailure`
	 * (`$lib/error/read`) decides it from the query. While it is, the list draws the failed state
	 * in place of its records and its empty state: no create offered there, no *nothing yet*, and
	 * no count above it, since whether the set holds anything is not known
	 * ([[rules/interface]], *Empty* and *Error*).
	 */
	failed?: boolean;
	/** Run the read again: the failed state's *try again*. Given with `failed`. */
	onRetry?: () => void;
	/**
	 * Whether the failed read is running again, as `toReadFailure` reports it. While it is, the
	 * failed state stays in place of the loading one and its *try again* is busy.
	 */
	retrying?: boolean;
};
