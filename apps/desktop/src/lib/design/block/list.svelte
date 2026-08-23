<script lang="ts" module>
	/**
	 * What a record wears to read as a card in this list.
	 *
	 * The block owns the geometry between cards and the concept owns what a card holds, so the
	 * surface itself is declared here and worn by the concept's own anchor — the anchor is the
	 * click target, and a treatment painted by the shell onto a wrapper would put the elevation
	 * on something the reader cannot press.
	 *
	 * It carries resting elevation rather than lifting only on hover, which is the answer a
	 * prototype gave against the real lists: a small shadow is not a per-row claim about
	 * importance, it is what makes a row read as an object at all — and a hover that has already
	 * been told these are objects is free to say only *this one* (_Use shadows to convey
	 * elevation_, 180). The ring is not decoration and not the book's: it is silent on dark mode,
	 * where a shadow against a dark ground reads as almost nothing, and the ring is what separates
	 * the card there.
	 */
	export const recordCard = [
		'rounded-2xl bg-card ring-1 ring-foreground/5 shadow-[0_1px_3px_rgba(0,0,0,0.18)]',
		'motion-safe:transition-[transform,box-shadow] motion-safe:duration-150',
		'hover:-translate-y-[3px] hover:shadow-[0_10px_20px_rgba(0,0,0,0.16)]'
	].join(' ');
</script>

<script lang="ts" generics="TData extends { id: string }, TGroup extends ListGroup">
	import { browser } from '$app/environment';
	import ExportDialog from '$lib/design/block/export-dialog.svelte';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Empty from '@rentable/design/primitive/empty/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import {
		toCsv,
		toExportFileName,
		toExportSheet,
		toNarrowedName,
		type CsvColumn,
		type ExportFormat
	} from '$lib/design/csv';
	import {
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
		toRecordRows,
		type ListMovement,
		type ListPosition
	} from '$lib/design/list-keyboard';
	import { selectedRecords } from '@rentable/design/selection.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { isolateDirection } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { isEditingText } from '@rentable/design/shortcut.js';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import { nextListSort, type ListSort } from '@rentable/design/sort.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { tauri } from '$lib/platform/tauri';
	import { Spinner } from '@rentable/design/primitive/spinner/index.js';
	import ArrowsSortIcon from '@tabler/icons-svelte/icons/arrows-sort';
	import CheckIcon from '@tabler/icons-svelte/icons/check';
	import ChecklistIcon from '@tabler/icons-svelte/icons/list-check';
	import ChevronDownIcon from '@tabler/icons-svelte/icons/chevron-down';
	import FilterIcon from '@tabler/icons-svelte/icons/filter';
	import TransferIcon from '@tabler/icons-svelte/icons/transfer';
	import ChevronUpIcon from '@tabler/icons-svelte/icons/chevron-up';
	import PlusIcon from '@tabler/icons-svelte/icons/plus';
	import SearchIcon from '@tabler/icons-svelte/icons/search';
	import XIcon from '@tabler/icons-svelte/icons/x';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { toast } from 'svelte-sonner';
	import { tick, type Snippet } from 'svelte';
	import { get } from 'svelte/store';

	/** One order the list offers the reader, keyed by a column the query can order by. */
	type ListSortOption = {
		/** The column's id, which is what the query orders by. */
		id: string;
		/** The name the sort control lists it under. */
		label: string;
	};

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
		/** Offered as the leading action when the list can create a record. */
		onCreate?: () => void;
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
			columns: CsvColumn<TData>[];
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
		/** What the empty state says when the list has no records to show. */
		emptyTitle?: string;
		/** An optional line under it, where the list can say why it is empty. */
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
		filterOptions = [],
		filters = $bindable({}),
		onImport,
		selectionActions,
		selected = $bindable([]),
		exportAs,
		recordHeight = 56,
		groupHeaderHeight = 36,
		recordMinWidth,
		emptyTitle = $LL.common.messages.noResults(),
		emptyDescription
	}: ListProps = $props();

	// the card grid's own value, arrived at there against real data.
	const SEARCH_DEBOUNCE_MS = 250;
	// the grid overscanned two rows of cards; a record row is a fraction of a card's height,
	// so the same two rows would buy a fraction of the distance ahead of the scroll.
	const OVERSCAN_ROWS = 8;

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

	// written from what was captured rather than from a fresh read: the file is the rows the
	// reader asked for, under the search and the order the list was showing them under.
	async function exportRows(format: ExportFormat) {
		if (!exportAs || !exporting || isExporting) return;

		const asked = exporting;
		isExporting = true;

		try {
			// where the file goes is the reader's, and the name this composes is only what the
			// dialog opens on. Walking away from it is not a failed export — nothing was written
			// and there is nothing to say about it.
			const chosen = await tauri.dialog.saveFile(toExportFileName(asked.name, format));

			if (!chosen) {
				return;
			}

			// which command rather than which argument: the two differ in what lands on disk, and
			// the text one prepends a byte-order mark that would corrupt an archive.
			const path =
				format === 'csv'
					? await tauri.export.write(chosen, toCsv(exportAs.columns, asked.rows))
					: await tauri.export.writeWorkbook(chosen, [toExportSheet(exportAs.columns, asked.rows)]);

			// the path is isolated because it is written left to right whatever the sentence
			// around it is, and an unisolated one reorders the Arabic it is spliced into.
			toast.success($LL.common.messages.exported({ path: isolateDirection(path) }));

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

	let viewport = $state<HTMLElement | null>(null);
	let viewportWidth = $state(0);
	let searchInput = $state(search);
	let searchElement = $state<HTMLInputElement | null>(null);
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
	// grouping without a header snippet would insert rows that render nothing and still take
	// up a header's height, so the two props only take effect as a pair.
	const rows = $derived(listRows(data, groupHeader ? groupOf : undefined, columns));
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
	const sortableColumnIds = $derived(sortOptions.map((option) => option.id));
	// which records a selection names, as the shared rule states it: in the list's own order, and
	// narrowed to the records the list is still showing.
	const selectedRows = $derived(selectedRecords(data, selected));

	const hasResults = $derived(rows.length > 0);
	const isAwaitingFirstResults = $derived(isLoading && !hasResults);
	const activeSortLabel = $derived(
		sortOptions.find((option) => option.id === sort?.columnId)?.label
	);

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

	$effect(() => {
		if (searchInput === search) {
			return;
		}

		const timeout = setTimeout(() => {
			search = searchInput;
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
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

	// registered rather than listened for: the search key reaches the application's one listener,
	// and the sheet reads all three from here without being told about them.
	$effect(() => shortcuts.register(...toListShortcuts(() => searchElement?.focus())));

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

	function chooseSort(columnId: string) {
		sort = nextListSort(sort, columnId, sortableColumnIds);
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex min-h-0 flex-1 flex-col gap-3" onkeydown={handleKeydown}>
	<div
		class="flex shrink-0 flex-col gap-3 rounded-2xl bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="relative w-full sm:max-w-sm">
			<SearchIcon
				class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:ref={searchElement}
				placeholder={$LL.common.table.searchPlaceholder()}
				value={searchInput}
				oninput={(event) => {
					searchInput = event.currentTarget.value;
				}}
				class="h-8 border-transparent bg-transparent ps-9 hover:bg-input/30"
			/>
		</div>

		<div class="flex shrink-0 flex-wrap items-center gap-3">
			<span class="text-xs text-muted-foreground" aria-live="polite">
				{$LL.common.table.results({ count: data.length })}
			</span>

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
									<FilterIcon />
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
							     reader who cannot get back to the whole list is stuck inside a subset. -->
							{#if chosen}
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									onSelect={() => (filters = withFilter(filters, filter.id, undefined))}
								>
									<XIcon class="size-3.5" />
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
					onclick={() => {
						isSelecting = !isSelecting;

						if (!isSelecting) {
							selected = [];
							runAnchor = null;
						}
					}}
				>
					<ChecklistIcon />
				</Button>
			{/if}

			{#if sortOptions.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<!-- filled while a sort is chosen, on the same rule as the filter beside it:
							     a control that decides which records the reader is looking at, or in
							     what order, says so by being filled. The export and create controls
							     stay outlined however often they are used — they act on the list rather
							     than deciding what it holds. -->
							<Button
								{...props}
								variant={sort ? 'default' : 'outline'}
								size="icon-sm"
								aria-label={activeSortLabel
									? `${$LL.common.actions.sortBy()}: ${activeSortLabel}`
									: $LL.common.actions.sortBy()}
							>
								<ArrowsSortIcon />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Label>{$LL.common.actions.sortBy()}</DropdownMenu.Label>
						<DropdownMenu.Separator />
						{#each sortOptions as option (option.id)}
							<DropdownMenu.Item onSelect={() => chooseSort(option.id)}>
								<span class="flex-1">{option.label}</span>
								{#if sort?.columnId === option.id}
									{#if sort.direction === 'asc'}
										<ChevronUpIcon class="size-3.5" />
									{:else}
										<ChevronDownIcon class="size-3.5" />
									{/if}
								{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
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
								     glyph here — a pair that already points both ways is the same pair
								     reflected, and the class would only swap which arrow is on top. -->
								<TransferIcon />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<!-- the two directions, and nothing else. Which file an export becomes is not a
						     third action beside them — it is a question about one of the two, and it is
						     asked in a dialog of its own once that one is chosen. -->
						{#if exportAs}
							<DropdownMenu.Item
								disabled={!hasResults || isExporting}
								onSelect={() => (exporting = { rows: data, name: exportAs.name })}
							>
								<span class="flex-1 capitalize">{$LL.common.actions.export()}</span>
							</DropdownMenu.Item>
						{/if}

						{#if onImport}
							<DropdownMenu.Item onSelect={() => onImport?.()}>
								<span class="flex-1 capitalize">{$LL.common.actions.import()}</span>
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			{#if onCreate}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.actions.newRecord()}
								onclick={() => onCreate()}
							>
								<PlusIcon />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.actions.newRecord()}
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</div>

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
	<div class="min-h-0 flex-1 overflow-hidden rounded-3xl">
		{#if isAwaitingFirstResults}
			<div class="flex h-full items-center justify-center" aria-busy="true">
				<Spinner class="size-6 text-muted-foreground" />
				<span class="sr-only">{$LL.common.ui.loading()}</span>
			</div>
		{:else if !hasResults}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Title>{emptyTitle}</Empty.Title>
					{#if emptyDescription}
						<Empty.Description>{emptyDescription}</Empty.Description>
					{/if}
				</Empty.Header>
			</Empty.Root>
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
							     being cut — still visible, and still fixed by raising `recordHeight`. -->
							<div
								data-index={virtualRow.index}
								class={cn(ROW_INSET, 'absolute start-0 top-0 w-full')}
								style={`height: ${virtualRow.size}px; padding-bottom: ${ROW_GAP}px; transform: translateY(${virtualRow.start}px);`}
							>
								<!-- each record renders inside a cell of the block's own, so a move can name the
								     record it lands on and find it again in the document. Nothing else hangs
								     off it: the card is still the concept's, and the cell is the address. -->
								{#if row.kind === 'header'}
									{@render groupHeader?.(row.group)}
								{:else if columns === 1}
									<div data-record="0" class="h-full">
										{@render selectableRecord(row.records[0])}
									</div>
								{:else}
									<div
										class="grid h-full"
										style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`}
									>
										{#each row.records as item, column (item.id)}
											<div data-record={column} class="h-full min-w-0">
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
