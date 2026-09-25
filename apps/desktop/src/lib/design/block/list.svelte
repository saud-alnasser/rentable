<script lang="ts" generics="TData extends { id: string }, TGroup extends ListGroup">
	import { browser } from '$app/environment';
	import ExportDialog from '@rentable/design/block/export-dialog.svelte';
	import CreateControl from '$lib/design/block/create-control.svelte';
	import EmptyState, { type EmptyKind } from '@rentable/design/block/empty.svelte';
	import Loading from '@rentable/design/block/loading.svelte';
	import RecordActionControl, {
		unavailableControl
	} from '@rentable/design/block/record-action-control.svelte';
	import {
		writeExport,
		toNarrowedName,
		type ExportColumn,
		type ExportFormat,
		type ExportWriter
	} from '@rentable/design/csv.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import {
		hasAnyFilter,
		toChosenOption,
		toFilterLabel,
		toFilterOptions,
		withFilter,
		type FilterSelection,
		type ListFilter
	} from '$lib/design/filter';
	import { listRows, type ListGroup } from '@rentable/design/group.js';
	import {
		nextPosition,
		toListMovement,
		toListShortcuts,
		toPositionOf,
		toRecordRows,
		type ListMovement,
		type ListPosition
	} from '$lib/design/list-keyboard';
	import { selectedRecords } from '@rentable/design/selection.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { isolateDirection } from '$lib/error/message';
	import { showErrorToast, showSuccessToast } from '$lib/error/toast';
	import { isEditingText } from '@rentable/design/shortcut.js';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import type { ListSort } from '@rentable/design/sort.js';
	import ListToolbar, { type ListSortOption } from '$lib/design/block/list-toolbar.svelte';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { tauri } from '$lib/platform/tauri';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ListTodoIcon from '@lucide/svelte/icons/list-todo';
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import {
		hasSameOrder,
		queueListMove,
		toClipPath,
		toTransitionName
	} from '$lib/design/list-motion';
	import { landing, whenSurfacesClose, type LandingRequest } from '$lib/design/landing.svelte';
	import { tick, untrack, type Snippet } from 'svelte';
	import { get } from 'svelte/store';

	type ListProps = {
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
		 * this width as there is room for — so the layout reflows on a resize instead of
		 * scrolling sideways. A list that leaves it unset is one record wide.
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
	};

	let {
		data,
		record,
		groupOf,
		groupHeader,
		sortOptions = [],
		sort = $bindable(null),
		search = $bindable(''),
		isLoading = false,
		isFetching = false,
		onCreate,
		createLabel,
		createUnavailable,
		filterOptions = [],
		filters = $bindable({}),
		onImport,
		importUnavailable,
		selectionActions,
		selected = $bindable([]),
		exportAs,
		recordHeight = 56,
		groupHeaderHeight = 36,
		recordMinWidth,
		emptyTitle,
		emptyDescription
	}: ListProps = $props();

	// the grid overscanned two rows of cards; a record row is a fraction of a card's height,
	// so the same two rows would buy a fraction of the distance ahead of the scroll.
	const OVERSCAN_ROWS = 8;
	// as many cards as the tallest window shows before the first result lands; the frame clips
	// the rest.
	const SKELETON_ROWS = 12;

	let isExporting = $state(false);
	/**
	 * What an export was asked for: which rows, and what to call the file.
	 *
	 * Taken at the moment a control is pressed rather than read again when the format is chosen.
	 * The list keeps moving behind the dialog, and a selection export that read the selection
	 * again at submit time could write a different set, or an empty file, than the one the reader
	 * asked for. `null` means no export is being asked about, which is also what closes the
	 * dialog.
	 */
	let exporting = $state<{ rows: TData[]; name: string } | null>(null);

	/**
	 * this application's answer to the three things an export cannot do for itself.
	 *
	 * The seam is here rather than in the package because choosing a path and putting bytes on it
	 * is what a shell has and a package does not. Which command rather than which argument, on the
	 * far side of it: the two differ in what lands on disk, and the text one prepends a
	 * byte-order mark that would corrupt an archive.
	 */
	const writer: ExportWriter = {
		chooseFile: (suggested) => tauri.dialog.saveFile(suggested),
		writeText: (path, contents) => tauri.export.write(path, contents),
		writeWorkbook: (path, sheets) => tauri.export.writeWorkbook(path, sheets)
	};

	// written from what was captured rather than from a fresh read: the file is the rows the
	// reader asked for, under the search and the order the list was showing them under.
	async function exportRows(format: ExportFormat) {
		if (!exportAs || !exporting || isExporting) return;

		const asked = exporting;
		isExporting = true;

		try {
			const path = await writeExport(writer, {
				name: asked.name,
				format,
				columns: exportAs.columns,
				records: asked.rows
			});

			// where the file goes is the reader's, and walking away from that dialog is not a
			// failed export, because nothing was written and there is nothing to say about it.
			if (!path) {
				return;
			}

			// the path is isolated because it is written left to right whatever the sentence
			// around it is, and an unisolated one reorders the Arabic it is spliced into.
			showSuccessToast($LL.common.messages.exported({ path: isolateDirection(path) }));

			// a file manager that will not open is not a failed export: the file is written and
			// the user has been told where.
			await tauri.opener.revealItemInDir(path).catch(() => {});
		} catch (failure) {
			// the export is not a mutation, and what a refused command carries is `{ code,
			// message }` rather than an Error — so it is decoded rather than read as prose.
			showErrorToast(failure, $LL);
		} finally {
			isExporting = false;
		}
	}

	/**
	 * The result set the rows are drawn from: `data`, committed rather than read.
	 *
	 * A change to `data` is not drawn the moment it arrives. It is committed here, inside a view
	 * transition where it moves something and directly where it does not, so a record created
	 * arrives, a record deleted leaves, an undone delete comes back in place and a re-sorted record
	 * moves, rows the virtualiser adds or removes included. Raw, because the records are the
	 * query's objects and nothing here writes into them.
	 */
	let displayed = $state.raw(untrack(() => data));
	/** What the last commit asked for, which a transition draws once it gets to: always the latest. */
	let committing = untrack(() => data);
	/**
	 * Whether the next change to `data` is the answer to this list's own search.
	 *
	 * Set at the moment the block writes `search`, and spent by the change that answers it. A
	 * keystroke narrows what the reader is looking at, and records sliding under the letters would
	 * be motion on a path used many times a minute, so that change is drawn at once. Plain rather
	 * than state: it is read and written inside the commit and nothing draws it.
	 */
	let isAwaitingSearch = false;
	/** Whether the list was still waiting for its first result set when `data` last moved. */
	let wasLoading = untrack(() => isLoading);
	/**
	 * Whether this list's records are what a transition in flight is capturing.
	 *
	 * The names are worn only for the length of this list's own transition. Worn always, another
	 * list on the same screen would have its records captured by this one's transition and clipped
	 * to this one's frame.
	 */
	let isMoving = $state(false);
	/**
	 * Whether this list has a move waiting its turn. The waiting move draws whatever was committed
	 * last when it starts, so a change arriving meanwhile needs no move of its own.
	 */
	let isQueued = false;
	// what scopes this list's names, so two lists on one screen can show the same record.
	const listId = $props.id();
	// what names the empty state's refused create to assistive technology, whether or not its
	// tooltip is drawn.
	const emptyCreateReasonId = `${listId}-create-reason`;
	// the same, for the transfer menu's refused entries.
	const transferReasonId = (which: 'export' | 'import') => `${listId}-${which}-reason`;
	// the tooltip trigger's attributes on a menu entry, less the two that would name it something
	// else: its slot, and the button type a trigger carries. As `record-card.svelte` does it.
	const asMenuEntry = (props: Record<string, unknown>) => {
		const hint = { ...props };

		delete hint['data-slot'];
		delete hint.type;

		return hint;
	};
	let frame = $state<HTMLElement | null>(null);

	/**
	 * Draw `next` inside a same-document view transition, and directly where the webview has none.
	 *
	 * The document itself is not captured while this runs: its `view-transition-name` is taken away
	 * for the length of the transition, so the root snapshot does not animate and everything around
	 * the records stays live under the pointer. Only the records are captured, and their layer is
	 * clipped to the frame, since it is drawn above the whole document and the frame's own clip does
	 * not reach it.
	 */
	function commitMoving(next: TData[]) {
		committing = next;

		if (typeof document.startViewTransition !== 'function' || !frame) {
			displayed = next;

			return;
		}

		if (isQueued) {
			return;
		}

		// in turn with every other list's moves, since the document holds one transition and one
		// mark at a time (`queueListMove`).
		isQueued = true;
		void queueListMove(() => {
			isQueued = false;

			return move();
		});
	}

	/** Start this list's transition, now that no other is running, and settle once it ends. */
	async function move() {
		// the frame left while the move waited, or a direct commit drew the latest set meanwhile.
		if (!frame?.isConnected || displayed === committing) {
			displayed = committing;

			return;
		}

		const root = document.documentElement;

		isMoving = true;
		root.style.setProperty(
			'--list-motion-clip',
			toClipPath(frame.getBoundingClientRect(), getComputedStyle(frame).borderTopLeftRadius)
		);
		root.dataset.listMotion = '';

		try {
			// the old state is captured at the next frame, after the microtask that draws
			// `isMoving`, so the names are on the records by then.
			const transition = document.startViewTransition(async () => {
				displayed = committing;
				await tick();
			});

			await transition.finished;
		} finally {
			isMoving = false;
			delete root.dataset.listMotion;
			root.style.removeProperty('--list-motion-clip');
		}
	}

	// every change to `data` passes through here, and only a change that moves something moves.
	$effect(() => {
		const next = data;
		const loading = isLoading;

		untrack(() => {
			// the first result set is the list appearing, not records arriving in it. Read across two
			// passes, because the set lands in the same update that ends the loading.
			const isFirstArrival = wasLoading || loading;
			wasLoading = loading;

			if (next === committing) {
				return;
			}

			const isSearchAnswer = isAwaitingSearch;
			isAwaitingSearch = false;

			if (isFirstArrival || isSearchAnswer || hasSameOrder(committing, next)) {
				committing = next;
				displayed = next;

				return;
			}

			commitMoving(next);
		});
	});

	let viewport = $state<HTMLElement | null>(null);
	let viewportWidth = $state(0);
	// which record the keyboard is on. It is a place in the layout rather than a record, because a
	// resize relays the same records across a different number of columns and the reader's finger
	// stays where it was on the screen.
	let focused = $state<ListPosition | null>(null);
	// a move whose element is not in the document yet. See the effect that answers it.
	let awaitingFocus = $state<ListPosition | null>(null);

	// the record's own link, which `record-card` documents as the card's single tab stop. The
	// query is written as what the browser would tab to rather than as `a`, so a record that is
	// opened by a button rather than by a link is reached by the same move.
	const RECORD_TAB_STOP = 'a[href], button, [tabindex]:not([tabindex="-1"])';

	// the space between one card and the next. It rides inside the row the virtualizer lays out,
	// as that row's own bottom padding, rather than as a margin on the card: rows are laid out at
	// a declared height and never measured, so a margin would put every card slightly below where
	// the virtualizer believes it is and the error would accumulate down the list.
	const ROW_GAP = 12;
	// enough for a card's shadow to fall without being cut: setting one axis of `overflow` makes
	// the other `auto`, so a shadow at the viewport's edge is clipped rather than drawn.
	const ROW_INSET = 'px-2';

	// the column count is measured rather than declared, because the shape it serves reflows:
	// the reader's window decides how many records fit, and the query knows nothing about it.
	const columns = $derived(
		recordMinWidth ? Math.max(1, Math.floor(viewportWidth / recordMinWidth)) : 1
	);
	// the skeleton stands where the viewport will be, before there is a viewport to measure, so it
	// counts its columns off the frame around both.
	let frameWidth = $state(0);
	const skeletonColumns = $derived(
		recordMinWidth ? Math.max(1, Math.floor(frameWidth / recordMinWidth)) : 1
	);
	// grouping without a header snippet would insert rows that render nothing and still take
	// up a header's height, so the two props only take effect as a pair.
	const rows = $derived(listRows(displayed, groupHeader ? groupOf : undefined, columns));
	const recordRows = $derived(toRecordRows(rows));
	const direction = $derived(localesMetadata[$locale].direction);

	// selection is a mode the reader turns on, not a set of controls every list wears. A checkbox
	// against every row on every screen is a permanent invitation to an action almost nobody is
	// taking, and it costs the rows their alignment to carry it.
	let isSelecting = $state(false);
	const isSelectable = $derived(Boolean(selectionActions) && isSelecting);
	// the ids in the order the list is showing them, which is what a run between two records
	// means. Read off the laid-out rows rather than off `data`, so it is the order on screen.
	const orderedIds = $derived(
		rows.flatMap((row) => (row.kind === 'record' ? row.records.map((item) => item.id) : []))
	);
	const selectedIds = $derived(new Set(selected));
	// where a run starts from: the last record the reader picked without holding shift. Reset
	// whenever the selection is emptied, so a run never reaches back to a record from before.
	let runAnchor = $state<string | null>(null);
	// read at the moment of the change rather than from the event, because the checkbox reports
	// its new state and not what was held down to produce it.
	let isExtending = $state(false);

	/** Take a record in or out of the selection, extending from the anchor while shift is held. */
	function chooseRecord(id: string) {
		if (isExtending && runAnchor !== null) {
			const from = orderedIds.indexOf(runAnchor);
			const to = orderedIds.indexOf(id);

			if (from !== -1 && to !== -1) {
				const run = orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);

				// added to what is held rather than replacing it: a reader assembling a selection out
				// of several runs is doing something ordinary, and a run that cleared the rest would
				// throw away the work between them.
				selected = [...new Set([...selected, ...run])];

				return;
			}
		}

		runAnchor = id;
		selected = selectedIds.has(id) ? selected.filter((held) => held !== id) : [...selected, id];
	}
	// which records a selection names, as the shared rule states it: in the list's own order, and
	// narrowed to the records the list is still showing.
	const selectedRows = $derived(selectedRecords(data, selected));

	const hasResults = $derived(rows.length > 0);
	// why the list cannot be written to a file now: it shows nothing, and a file of no rows is not
	// one anybody asked for ([[rules/interface]], *Export and import*).
	const exportUnavailable = $derived(hasResults ? undefined : $LL.common.export.nothingToExport());
	// an empty list read under a search or a filter is a narrowing that matched nothing, and says
	// so; read under neither, it is a list with nothing in it yet. The two never read the same.
	const isSearched = $derived(search.trim() !== '');
	const isFiltered = $derived(hasAnyFilter(filters));
	const emptyKind = $derived<EmptyKind>(isSearched || isFiltered ? 'no-match' : 'nothing-yet');
	const clearLabel = $derived(
		isSearched && isFiltered
			? $LL.common.actions.clearSearchAndFilters()
			: isSearched
				? $LL.common.actions.clearSearch()
				: $LL.common.actions.clearFilters()
	);

	/** Put down whatever narrowed the list to nothing, so the whole set is drawn again. */
	function clearNarrowing() {
		// the answer is the list's own search being undone, so it is drawn at once, as a keystroke's
		// answer is.
		isAwaitingSearch = true;
		search = '';
		filters = {};
	}
	const isAwaitingFirstResults = $derived(isLoading && !hasResults);

	const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
		count: 0,
		getScrollElement: () => null,
		estimateSize: () => 1,
		overscan: OVERSCAN_ROWS,
		enabled: false
	});
	const virtualRows = $derived($virtualizer.getVirtualItems());
	const totalHeight = $derived($virtualizer.getTotalSize());

	$effect(() => {
		get(virtualizer).setOptions({
			count: rows.length,
			getScrollElement: () => viewport,
			// a header takes the gap a record takes, so one rhythm runs the length of the list. What
			// separates a group is the header itself — it is a card of its own, and a card that names
			// a month is not mistaken for a card that is a record.
			estimateSize: (index) =>
				(rows[index]?.kind === 'header' ? groupHeaderHeight : recordHeight) + ROW_GAP,
			getItemKey: (index) => rows[index]?.key ?? index,
			// space before the first card, so a card at the top of the list has somewhere to lift
			// into — without it the topmost card's rise is cut by the scroll edge and reads as the
			// card sliding under the toolbar rather than rising towards the reader.
			//
			// It is the virtualizer's own padding and not CSS on the scroll element, and the two are
			// not interchangeable: padding on the scroll element leaves `scrollTop` and the item
			// offsets out of phase by its own measure, and every offset this list reports would be
			// wrong by it.
			paddingStart: ROW_GAP,
			overscan: OVERSCAN_ROWS,
			enabled: browser && !!viewport
		});
	});

	// a new order is a new list: the row under the pointer is not the row that was there, so
	// staying at the old offset would leave the user somewhere they never scrolled to. The
	// keyboard's place goes with it, for the same reason.
	$effect(() => {
		void search;
		void sort;
		// and a narrowing is a new list for the same reason: the rows the read returns are a
		// different set, so the row the keyboard was on may not be among them.
		void filters;

		focused = null;
		// the selection goes too. It is a set of records the reader picked out of what they could
		// see, and once the read returns something else it holds records that are no longer on
		// screen — acting on those is acting on records nobody is looking at.
		selected = [];
		runAnchor = null;

		void tick().then(() => {
			get(virtualizer).scrollToOffset(0);
		});
	});

	// registered rather than listened for: the sheet reads both from here without being told about
	// them. The search key is the search field's, which registers it wherever a set is searched.
	$effect(() => shortcuts.register(...toListShortcuts()));

	/**
	 * Answer a move by putting the focus on the record it lands on.
	 *
	 * The row is scrolled to rather than the element being relied on to bring itself into view: a
	 * move out of the search field can land many rows from whatever the reader had scrolled to,
	 * and a row outside the rendered window has no element to focus at all. Which is why the
	 * request is left standing rather than dropped — the effect below answers it once the row is
	 * laid out.
	 */
	function moveFocus(movement: ListMovement) {
		const next = nextPosition(recordRows, focused, movement);

		if (!next) {
			return;
		}

		focused = next;
		awaitingFocus = next;
		get(virtualizer).scrollToIndex(next.row);
	}

	// the standing request, answered the moment the row it names is rendered. Reading the rendered
	// window is what makes that happen: a scroll moves it, this runs again, and the focus lands —
	// which is also what carries it across the boundary where rows are recycled.
	$effect(() => {
		void virtualRows;

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
		awaitingFocus = null;
	});

	/**
	 * The landing request this list has answered, so it answers each one once. Plain rather than
	 * state: it is read and written inside the answer and nothing draws it.
	 */
	let answeredLanding: LandingRequest | null = null;
	/** A record this list took, waiting for its row to be drawn. */
	let arriving = $state<string | null>(null);

	// a record just created is answered for here, once, from the set this list holds
	// ([[rules/interface]], *Guidance*). Holding it, the list takes it at once, so a second list
	// showing the same record does not answer too. Not holding it, the list is done with it: a
	// later change bringing the record in, a filter cleared say, is not the create it answers.
	$effect(() => {
		const request = landing.pending;

		// a set still loading has nothing to answer from yet.
		if (!request || isLoading) {
			return;
		}

		const isHeld = data.some((item) => item.id === request.id);

		untrack(() => {
			if (answeredLanding === request) {
				return;
			}

			answeredLanding = request;

			if (isHeld) {
				landing.take(request);
				arriving = request.id;
			}
		});
	});

	// the record taken, brought into view once its row is drawn, and the focus put on it once the
	// form that made it has gone, through the same standing request a move raises. The row can be a
	// transition behind the result set, which is why this waits on `rows` rather than on `data`.
	$effect(() => {
		const id = arriving;

		if (!id) {
			return;
		}

		// gone again before it was drawn, so there is nothing to land on.
		if (!data.some((item) => item.id === id)) {
			arriving = null;

			return;
		}

		const position = toPositionOf(rows, id);

		if (!position) {
			return;
		}

		untrack(() => {
			arriving = null;
			get(virtualizer).scrollToIndex(position.row, { align: 'center' });

			void whenSurfacesClose().then(() => {
				focused = position;
				awaitingFocus = position;
				get(virtualizer).scrollToIndex(position.row, { align: 'auto' });
			});
		});
	});

	function handleKeydown(event: KeyboardEvent) {
		const movement = toListMovement(event.key, direction);

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
		moveFocus(movement);
	}
</script>

<!-- the keys are answered here rather than on the records, so a move works from the search field
     as well as from a card — the whole point being that one reader gets from typing to opening
     without leaving the keyboard. It is not an interactive element and is not becoming one: what
     it holds are already tab stops of their own, and giving the container a role would announce a
     control that is not there. -->
{#snippet selectableRecord(item: TData)}
	{#if isSelectable}
		<!-- the checkbox sits beside the card rather than on it: the card is the concept's and is
		     one tab stop that opens the record, and a control inside it would be a second thing to
		     press in the place a reader presses to open. -->
		<div class="flex h-full items-center gap-2">
			<!-- shift is read here rather than from the checkbox, which reports the state it is
			     moving to and nothing about what was held down to move it. -->
			<div
				onpointerdown={(event) => (isExtending = event.shiftKey)}
				onkeydown={(event) => (isExtending = event.shiftKey)}
				class="shrink-0"
				role="none"
			>
				<Checkbox
					checked={selectedIds.has(item.id)}
					onCheckedChange={() => chooseRecord(item.id)}
					aria-label={$LL.common.table.selectRecord()}
				/>
			</div>
			<div class="h-full min-w-0 flex-1">{@render record(item)}</div>
		</div>
	{:else}
		{@render record(item)}
	{/if}
{/snippet}

<!-- the create the toolbar offers, in words, where the list holds nothing yet. The key stays the
     toolbar control's: this one holds no place, so the two cannot answer it twice.

     Refused exactly when the toolbar's is, and for the same reason: dimmed, still reachable by the
     pointer and the keyboard, and saying why on hover and focus rather than offering a create the
     set will not take ([[rules/interface]], *Guidance*). -->
{#snippet createAct()}
	<Tooltip.Root disabled={!createUnavailable}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="sm"
					class={createUnavailable ? unavailableControl : undefined}
					data-empty-create
					data-unavailable={createUnavailable ? '' : undefined}
					aria-disabled={createUnavailable ? 'true' : undefined}
					aria-describedby={createUnavailable ? emptyCreateReasonId : undefined}
					onclick={() => {
						if (!createUnavailable) {
							onCreate?.();
						}
					}}
				>
					<PlusIcon />
					{createLabel}
					{#if createUnavailable}
						<span id={emptyCreateReasonId} class="sr-only">{createUnavailable}</span>
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			<span data-unavailable-reason>{createUnavailable}</span>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<!-- one direction of the transfer menu. Where it cannot run it stays in the menu, dimmed and
     refused, and says why beside the entry on hover and focus, as a record's menu entry does: a
     menu's own disabled entry is skipped by the keyboard and ignores the pointer, which would leave
     the reason unreachable ([[rules/interface]], *Guidance*). Refusing the selection also keeps the
     menu open with the reason showing. -->
{#snippet transferEntry(
	which: 'export' | 'import',
	label: string,
	unavailable: string | undefined,
	run: () => void
)}
	{#if unavailable}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props: hint })}
					<DropdownMenu.Item
						{...asMenuEntry(hint)}
						data-transfer={which}
						onSelect={(event: Event) => event.preventDefault()}
					>
						{#snippet child({ props })}
							<div
								{...props}
								aria-disabled="true"
								aria-describedby={transferReasonId(which)}
								data-unavailable=""
								class={cn(props.class as string, 'cursor-not-allowed opacity-50')}
							>
								<span class="flex-1 capitalize">{label}</span>
								<span id={transferReasonId(which)} class="sr-only">{unavailable}</span>
							</div>
						{/snippet}
					</DropdownMenu.Item>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side={direction === 'rtl' ? 'left' : 'right'} sideOffset={8}>
				<span data-unavailable-reason>{unavailable}</span>
			</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<DropdownMenu.Item data-transfer={which} disabled={isExporting} onSelect={run}>
			<span class="flex-1 capitalize">{label}</span>
		</DropdownMenu.Item>
	{/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex min-h-0 flex-1 flex-col gap-3" onkeydown={handleKeydown}>
	<!-- the bar every searchable set opens with: the search, what the set is, and what can be done
	     to it ([[rules/interface]], *Search*). -->
	<ListToolbar
		bind:search
		onSearch={() => (isAwaitingSearch = true)}
		count={displayed.length}
		narrowed={isFiltered}
		{sortOptions}
		bind:sort
	>
		{#snippet narrowing()}
			<!-- with the other controls rather than before the count: narrowing, ordering, exporting
			     and creating are the four things the toolbar does, and the count is what the list
			     currently is. Standing between them made the filter read as part of the reading
			     rather than as one of the controls. -->
			{#each filterOptions as filter (filter.id)}
				{@const chosen = toChosenOption(filter, filters)}
				<!-- an icon, like the sort control beside it: both are ways of asking the same list a
				     narrower question, and one of them wearing a word made the toolbar read as
				     though they were different kinds of thing.

				     A narrowed list says so by the control being filled rather than by printing the
				     value beside it. What it is narrowed *to* is on the menu, checked — and it is
				     also the control's accessible name, so a reader who cannot see the fill is told
				     the value rather than that a filter exists. -->
				<div class="flex items-center gap-1.5">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant={chosen ? 'default' : 'outline'}
									size="icon-sm"
									aria-label={toFilterLabel(filter, filters, $LL)}
								>
									<FunnelIcon />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Label class="capitalize">{filter.label($LL)}</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#each toFilterOptions(filter) as option (option.id)}
								<DropdownMenu.Item
									onSelect={() => {
										// choosing what is already chosen clears it, so the menu needs no
										// entry of its own for "all" and the vocabulary is the whole list.
										filters = withFilter(
											filters,
											filter.id,
											chosen?.id === option.id ? undefined : option.id
										);
									}}
								>
									<span class="flex-1 capitalize">{option.label($LL)}</span>
									{#if chosen?.id === option.id}
										<CheckIcon class="size-3.5" />
									{/if}
								</DropdownMenu.Item>
							{/each}

							<!-- an entry of its own rather than only the toggle above it: pressing the
							     chosen value again clears it, but nothing on the screen says so, and a
							     reader who cannot get back to the whole list is stuck inside a subset.

							     No glyph before it: the values above it carry none, and a menu whose
							     items carry icons carries them on every item or on none. -->
							{#if chosen}
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									onSelect={() => (filters = withFilter(filters, filter.id, undefined))}
								>
									<span class="flex-1">{$LL.common.actions.clearFilter()}</span>
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/each}

			{#if selectionActions}
				<!-- beside the filter, and filled while it is on, like every other control here that
				     changes what the reader is working with. Leaving the mode puts the selection down
				     with it: a set held invisibly is a set the next action would act on by surprise. -->
				<Button
					variant={isSelecting ? 'default' : 'outline'}
					size="icon-sm"
					aria-pressed={isSelecting}
					aria-label={$LL.common.actions.selectRecords()}
					data-select-control
					onclick={() => {
						isSelecting = !isSelecting;

						if (!isSelecting) {
							selected = [];
							runAnchor = null;
						}
					}}
				>
					<ListTodoIcon />
				</Button>
			{/if}
		{/snippet}

		{#if exportAs || onImport}
			<!-- a menu rather than the bare icon it was: the icon could say *export* and nothing
			     else, so a second format had nowhere to be named and neither had the direction.
			     The groups are the directions, which is what leaves the import one a place to be
			     added rather than a control to be rebuilt around it. -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							size="icon-sm"
							aria-label={$LL.common.actions.transferData()}
							disabled={isExporting}
						>
							<!-- both directions, because the control now offers both: an arrow leaving a
							     table said *export* and left the import item under a glyph contradicting
							     it. Two arrows, one each way.

							     Not mirrored in the other reading direction, unlike every directional
							     glyph here: a pair that already points both ways is the same pair
							     reflected, and the class would only swap which arrow is on top. -->
							<ArrowLeftRightIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<!-- the two directions, and nothing else. Which file an export becomes is not a
					     third action beside them; it is a question about one of the two, and it is
					     asked in a dialog of its own once that one is chosen. -->
					{#if exportAs}
						{@render transferEntry(
							'export',
							$LL.common.actions.export(),
							exportUnavailable,
							() => (exporting = { rows: data, name: exportAs.name })
						)}
					{/if}

					{#if onImport}
						{@render transferEntry('import', $LL.common.actions.import(), importUnavailable, () =>
							onImport?.()
						)}
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
		<!-- last, at the end of the bar: the one place every set offers its create
		     ([[rules/interface]], *Create*). -->
		{#if onCreate}
			<CreateControl label={createLabel ?? ''} {onCreate} unavailable={createUnavailable} />
		{/if}
	</ListToolbar>

	<!-- present only while something is selected, and above the rows rather than floating over
	     them: what it offers is destructive, and a bar that covers the last row is a bar that
	     hides one of the records it is about to act on. -->
	{#if isSelectable && selected.length > 0}
		<div
			class="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl bg-secondary px-3 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
		>
			<span class="text-sm font-medium" aria-live="polite">
				{$LL.common.table.recordsSelected({ count: selected.length })}
			</span>

			<div class="ms-auto flex flex-wrap items-center gap-1.5">
				{@render selectionActions?.(selected)}

				<!-- the list's own export, aimed at the selection instead of at everything on screen.
				     It belongs to this block rather than to the concept beside it: the columns and
				     the file are the list's, and every list that exports gets this by exporting.

				     Absent rather than disabled where the selection names nothing this list is
				     still showing, so there is no control here that would write an empty file. -->
				{#if exportAs && selectedRows.length > 0}
					<RecordActionControl
						label={$LL.common.actions.exportSelection()}
						icon={DownloadIcon}
						onclick={() =>
							(exporting = {
								rows: selectedRows,
								// the list's own naming, applied to one more narrowing. A file of the whole
								// directory and a file of the nine records picked out of it are otherwise
								// the same name, and the second replaces the first unless the reader
								// notices, which is the reason `toNarrowedName` exists at all.
								name: toNarrowedName(exportAs.name, [
									$LL.common.table.recordsSelected({ count: selectedRows.length })
								])
							})}
					/>
				{/if}

				<!-- the same treatment the concept's own controls wear, so the row reads as one
				     cluster of actions rather than as icons with a word bolted on the end. -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="icon-sm"
								class="rounded-full bg-secondary"
								aria-label={$LL.common.actions.clearSelection()}
								onclick={() => {
									selected = [];
									runAnchor = null;
								}}
							>
								<XIcon class="size-4" />
								<span class="sr-only">{$LL.common.actions.clearSelection()}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.actions.clearSelection()}
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>
	{/if}

	<!-- no frame of its own: the cards carry their own edges, and a bordered box drawn around
	     bordered rows is the arrangement _Use fewer borders_ (238) exists to replace. -->
	<div
		bind:this={frame}
		class="min-h-0 flex-1 overflow-hidden rounded-3xl"
		bind:clientWidth={frameWidth}
	>
		<Loading
			loading={isAwaitingFirstResults}
			label={$LL.common.ui.loading()}
			class={cn(ROW_INSET, 'flex h-full flex-col overflow-hidden')}
		>
			<!-- the shape of the first screenful: cards at the height and in the columns the rows will
			     take, with the gap the virtualizer puts before and between them. -->
			{#snippet skeleton()}
				{#each { length: SKELETON_ROWS }, index (index)}
					<div
						class="grid shrink-0 gap-3"
						style={`height: ${recordHeight}px; margin-top: ${ROW_GAP}px; grid-template-columns: repeat(${skeletonColumns}, minmax(0, 1fr));`}
					>
						{#each { length: skeletonColumns }, column (column)}
							<Skeleton class="h-full rounded-2xl" />
						{/each}
					</div>
				{/each}
			{/snippet}

			{#if !hasResults}
				<!-- the one empty treatment ([[rules/interface]], *Empty*). Nothing yet says what the
				     list will hold and offers the create the toolbar offers; a narrowing that matched
				     nothing says so and offers to put the narrowing down. -->
				{#if emptyKind === 'no-match'}
					<EmptyState kind="no-match" title={$LL.common.messages.noMatch()}>
						{#snippet action()}
							<Button variant="outline" size="sm" onclick={clearNarrowing}>
								<XIcon />
								{clearLabel}
							</Button>
						{/snippet}
					</EmptyState>
				{:else}
					<EmptyState
						kind="nothing-yet"
						title={emptyTitle}
						description={emptyDescription}
						action={onCreate ? createAct : undefined}
					/>
				{/if}
			{:else}
				<div
					bind:this={viewport}
					bind:clientWidth={viewportWidth}
					class="h-full overflow-y-auto"
					aria-busy={isFetching || undefined}
				>
					<div class="relative w-full" style={`height: ${totalHeight}px;`}>
						{#each virtualRows as virtualRow (virtualRow.key)}
							{@const row = rows[virtualRow.index]}
							{#if row}
								<!-- the row is not clipped, and that is a trade rather than an oversight: the
								     clip used to make a card that outgrew its declared height visible where it
								     was caused, and a card that lifts on hover has to leave its row. The two
								     cannot both hold, so an outgrown card now overlaps the one below instead of
								     being cut: still visible, and still fixed by raising `recordHeight`. -->
								<div
									data-index={virtualRow.index}
									class={cn(ROW_INSET, 'absolute start-0 top-0 w-full')}
									style={`height: ${virtualRow.size}px; padding-bottom: ${ROW_GAP}px; transform: translateY(${virtualRow.start}px);`}
								>
									<!-- each record renders inside a cell of the block's own, so a move can name the
									     record it lands on and find it again in the document. Nothing else hangs
									     off it: the card is still the concept's, and the cell is the address. -->
									{#if row.kind === 'header'}
										<div
											class="h-full"
											style:view-transition-name={isMoving
												? toTransitionName(listId, row.key)
												: undefined}
										>
											{@render groupHeader?.(row.group)}
										</div>
									{:else if columns === 1}
										<div
											data-record="0"
											class="h-full"
											style:view-transition-name={isMoving
												? toTransitionName(listId, row.records[0].id)
												: undefined}
										>
											{@render selectableRecord(row.records[0])}
										</div>
									{:else}
										<div
											class="grid h-full"
											style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`}
										>
											{#each row.records as item, column (item.id)}
												<div
													data-record={column}
													class="h-full min-w-0"
													style:view-transition-name={isMoving
														? toTransitionName(listId, item.id)
														: undefined}
												>
													{@render selectableRecord(item)}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}
		</Loading>
	</div>
</div>

{#if exporting}
	<!-- which file this list becomes, asked once the direction is chosen. Mounted only while one
	     is being asked about, so a list that offers no export carries no dialog. -->
	<ExportDialog
		open
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				exporting = null;
			}
		}}
		{isExporting}
		onExport={exportRows}
	/>
{/if}

<style>
	/* the document is not captured while a list moves, so nothing outside its records animates and
	   the page around them stays live. */
	:global(html[data-list-motion]) {
		view-transition-name: none;
	}

	/* the layer the snapshots are drawn on, cut to the list's frame. It lets the pointer through, so
	   a click during the move reaches the page rather than the layer over it. */
	:global(html[data-list-motion]::view-transition) {
		clip-path: var(--list-motion-clip);
		pointer-events: none;
	}

	/* a record changing place travels from its old box to its new one. It runs on the slow step
	   because a re-sorted record can cross the whole frame, and on the base step it read as a jump.
	   The reduced-motion block in the token layer takes every animation here away. */
	:global(html[data-list-motion]::view-transition-group(*)) {
		animation-duration: var(--duration-slow);
		animation-timing-function: var(--ease-move);
	}

	/* a record that stays is drawn once: its new image, carried by the group. The browser adds the
	   old and new images together, and two fades on different curves sum to more than one card's
	   worth of light for most of the move, so every card that stayed brightened and settled back.
	   Hiding the old image leaves nothing to add. */
	:global(html[data-list-motion]::view-transition-old(*)) {
		animation: none;
		opacity: 0;
	}

	:global(html[data-list-motion]::view-transition-new(*)) {
		animation: none;
	}

	/* an image with no partner is a record leaving or arriving, and only that one fades: the one
	   leaving accelerates away and the one arriving settles. */
	:global(html[data-list-motion]::view-transition-old(*):only-child) {
		opacity: 1;
		animation: list-record-leave var(--duration-base) var(--ease-exit) both;
	}

	:global(html[data-list-motion]::view-transition-new(*):only-child) {
		animation: list-record-arrive var(--duration-base) var(--ease-enter) both;
	}

	@keyframes -global-list-record-leave {
		to {
			opacity: 0;
		}
	}

	@keyframes -global-list-record-arrive {
		from {
			opacity: 0;
		}
	}
</style>
