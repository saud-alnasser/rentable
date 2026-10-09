<script lang="ts" generics="TData extends { id: string }, TGroup extends ListGroup">
	import { browser } from '$app/environment';
	import ExportDialog from '@rentable/design/block/export-dialog.svelte';
	import { CreateControl } from '$lib/create/ui';
	import Loading from '@rentable/design/block/loading.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import { listRows, type ListGroup } from '@rentable/design/group.js';
	import { selectedRecords } from '@rentable/design/selection.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import ListTodoIcon from '@lucide/svelte/icons/list-todo';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';

	import { ListCommit } from '$lib/list/commit.svelte';
	import { ListExport } from '$lib/list/export.svelte';
	import { hasAnyFilter } from '$lib/list/filter';
	import { ListFocus } from '$lib/list/focus.svelte';
	import { toRecordRows } from '$lib/list/keyboard';
	import { columnsFor, type ListProps } from '$lib/list/list';
	import { ListSelection } from '$lib/list/selection.svelte';
	import Empty from './empty.svelte';
	import FilterMenu from './filter-menu.svelte';
	import ListToolbar from './list-toolbar.svelte';
	import Rows from './rows.svelte';
	import SelectionBar from './selection-bar.svelte';
	import TransferMenu from './transfer-menu.svelte';

	/**
	 * THE LIST
	 *
	 * Every set of records a surface draws as a directory: the bar above it, the rows, and what the
	 * set says where it holds nothing. What each prop means is `ListProps` (`list.ts`). The concerns
	 * this composes are its own modules: the commit and its motion (`commit.svelte.ts`), selection
	 * (`selection.svelte.ts`), the keyboard and where a created record lands (`focus.svelte.ts`) and
	 * the export (`export.svelte.ts`), with the pieces of the page beside this file.
	 */
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
		emptyDescription,
		failed = false,
		onRetry
	}: ListProps<TData, TGroup> = $props();

	// the grid overscanned two rows of cards; a record row is a fraction of a card's height,
	// so the same two rows would buy a fraction of the distance ahead of the scroll.
	const OVERSCAN_ROWS = 8;
	// as many cards as the tallest window shows before the first result lands; the frame clips
	// the rest.
	const SKELETON_ROWS = 12;

	const listExport = new ListExport<TData>(() => exportAs?.columns);

	// what scopes this list's names, so two lists on one screen can show the same record.
	const listId = $props.id();
	let frame = $state<HTMLElement | null>(null);

	const commit = new ListCommit<TData>({
		data: () => data,
		isLoading: () => isLoading,
		frame: () => frame
	});

	let viewport = $state<HTMLElement | null>(null);
	let viewportWidth = $state(0);

	// the space between one card and the next. It rides inside the row the virtualizer lays out,
	// as that row's own bottom padding, rather than as a margin on the card: rows are laid out at
	// a declared height and never measured, so a margin would put every card slightly below where
	// the virtualizer believes it is and the error would accumulate down the list.
	const ROW_GAP = 12;
	// enough for a card's shadow to fall without being cut: setting one axis of `overflow` makes
	// the other `auto`, so a shadow at the viewport's edge is clipped rather than drawn.
	const ROW_INSET = 'px-2';
	// what that inset takes from the width the records are laid across, both sides counted.
	const ROW_INSET_WIDTH = 16;
	// the space between one tile and the next across a row: `gap-3`, which the grid and its
	// skeleton both carry, and the same measure as the gap down the list.
	const COLUMN_GAP = 12;

	// the column count is measured rather than declared, because the shape it serves reflows:
	// the reader's window decides how many records fit, and the query knows nothing about it.
	const columns = $derived(
		recordMinWidth ? columnsFor(viewportWidth - ROW_INSET_WIDTH, recordMinWidth, COLUMN_GAP) : 1
	);
	// the skeleton stands where the viewport will be, before there is a viewport to measure, so it
	// counts its columns off the frame around both, by the same rule.
	let frameWidth = $state(0);
	const skeletonColumns = $derived(
		recordMinWidth ? columnsFor(frameWidth - ROW_INSET_WIDTH, recordMinWidth, COLUMN_GAP) : 1
	);
	// grouping without a header snippet would insert rows that render nothing and still take
	// up a header's height, so the two props only take effect as a pair.
	const rows = $derived(listRows(commit.displayed, groupHeader ? groupOf : undefined, columns));
	const recordRows = $derived(toRecordRows(rows));
	const direction = $derived(localesMetadata[$locale].direction);

	const selectedIds = $derived(new Set(selected));
	const selection = new ListSelection({
		selected: () => selected,
		selectedIds: () => selectedIds,
		select: (ids) => (selected = ids),
		// read off the laid-out rows rather than off `data`, so it is the order on screen.
		orderedIds: () =>
			rows.flatMap((row) => (row.kind === 'record' ? row.records.map((item) => item.id) : [])),
		offered: () => Boolean(selectionActions)
	});
	// which records a selection names, as the shared rule states it: in the list's own order, and
	// narrowed to the records the list is still showing.
	const selectedRows = $derived(selectedRecords(data, selected));

	const hasResults = $derived(rows.length > 0);
	// why the list cannot be written to a file now: it shows nothing, and a file of no rows is not
	// one anybody asked for ([[rules/interface]], *Export and import*).
	const exportUnavailable = $derived(hasResults ? undefined : $LL.common.export.nothingToExport());
	const isSearched = $derived(search.trim() !== '');
	const isFiltered = $derived(hasAnyFilter(filters));

	/** Put down whatever narrowed the list to nothing, so the whole set is drawn again. */
	function clearNarrowing() {
		// the answer is the list's own search being undone, so it is drawn at once, as a keystroke's
		// answer is.
		commit.awaitSearch();
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

	const focus = new ListFocus<TData, TGroup>({
		virtualizer,
		data: () => data,
		isLoading: () => isLoading,
		rows: () => rows,
		recordRows: () => recordRows,
		virtualRows: () => virtualRows,
		viewport: () => viewport,
		direction: () => direction,
		reads: () => [search, sort, filters],
		onNewList: selection.clear
	});
</script>

<!-- the keys are answered here rather than on the records, so a move works from the search field
     as well as from a card — the whole point being that one reader gets from typing to opening
     without leaving the keyboard. It is not an interactive element and is not becoming one: what
     it holds are already tab stops of their own, and giving the container a role would announce a
     control that is not there. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex min-h-0 flex-1 flex-col gap-3" onkeydown={focus.handleKeydown}>
	<!-- the bar every searchable set opens with: the search, what the set is, and what can be done
	     to it ([[rules/interface]], *Search*). -->
	<ListToolbar
		bind:search
		onSearch={commit.awaitSearch}
		count={failed ? undefined : commit.displayed.length}
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
				<FilterMenu {filter} bind:filters />
			{/each}

			{#if selectionActions}
				<!-- beside the filter, and filled while it is on, like every other control here that
				     changes what the reader is working with. Leaving the mode puts the selection down
				     with it: a set held invisibly is a set the next action would act on by surprise. -->
				<Button
					variant={selection.isSelecting ? 'default' : 'outline'}
					size="icon-sm"
					aria-pressed={selection.isSelecting}
					aria-label={$LL.common.actions.selectRecords()}
					data-select-control
					onclick={selection.toggle}
				>
					<ListTodoIcon />
				</Button>
			{/if}
		{/snippet}

		{#if exportAs || onImport}
			<TransferMenu
				{listId}
				{direction}
				isExporting={listExport.isExporting}
				onExport={exportAs ? () => listExport.ask(data, exportAs.name) : undefined}
				{exportUnavailable}
				{onImport}
				{importUnavailable}
			/>
		{/if}
		<!-- last, at the end of the bar: the one place every set offers its create
		     ([[rules/interface]], *Create*). -->
		{#if onCreate}
			<CreateControl label={createLabel ?? ''} {onCreate} unavailable={createUnavailable} />
		{/if}
	</ListToolbar>

	{#if selection.isSelectable && selected.length > 0}
		<SelectionBar
			{selected}
			actions={selectionActions}
			{selectedRows}
			exportName={exportAs?.name}
			onExport={listExport.ask}
			onClear={selection.clear}
		/>
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
						data-skeleton-row
						class="grid shrink-0 gap-3"
						style={`height: ${recordHeight}px; margin-top: ${ROW_GAP}px; grid-template-columns: repeat(${skeletonColumns}, minmax(0, 1fr));`}
					>
						{#each { length: skeletonColumns }, column (column)}
							<Skeleton class="h-full rounded-2xl" />
						{/each}
					</div>
				{/each}
			{/snippet}

			{#if failed || !hasResults}
				<Empty
					{listId}
					{isSearched}
					{isFiltered}
					onClear={clearNarrowing}
					title={emptyTitle}
					description={emptyDescription}
					{onCreate}
					{createLabel}
					{createUnavailable}
					{failed}
					{onRetry}
				/>
			{:else}
				<Rows
					bind:viewport
					bind:viewportWidth
					{isFetching}
					{totalHeight}
					{virtualRows}
					{rows}
					{columns}
					isGrid={recordMinWidth !== undefined}
					rowGap={ROW_GAP}
					rowInset={ROW_INSET}
					{listId}
					isMoving={commit.isMoving}
					{selection}
					{record}
					{groupHeader}
				/>
			{/if}
		</Loading>
	</div>
</div>

{#if listExport.exporting}
	<!-- which file this list becomes, asked once the direction is chosen. Mounted only while one
	     is being asked about, so a list that offers no export carries no dialog. -->
	<ExportDialog
		open
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				listExport.exporting = null;
			}
		}}
		isExporting={listExport.isExporting}
		onExport={listExport.write}
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
