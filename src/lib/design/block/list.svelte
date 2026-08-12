<script lang="ts" generics="TData extends { id: number }, TGroup extends ListGroup">
	import { browser } from '$app/environment';
	import { Button } from '$lib/design/primitive/button';
	import * as DropdownMenu from '$lib/design/primitive/dropdown-menu';
	import * as Empty from '$lib/design/primitive/empty';
	import { Input } from '$lib/design/primitive/input';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { toCsv, type CsvColumn } from '$lib/design/csv';
	import { listRows, stickyGroupRowIndex, type ListGroup } from '$lib/design/group';
	import { isolateDirection } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { nextListSort, type ListSort } from '$lib/design/sort';
	import { cn } from '$lib/design/tailwind';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tauri } from '$lib/platform/tauri';
	import ArrowsSortIcon from '@tabler/icons-svelte/icons/arrows-sort';
	import ChevronDownIcon from '@tabler/icons-svelte/icons/chevron-down';
	import DownloadIcon from '@tabler/icons-svelte/icons/download';
	import ChevronUpIcon from '@tabler/icons-svelte/icons/chevron-up';
	import PlusIcon from '@tabler/icons-svelte/icons/plus';
	import SearchIcon from '@tabler/icons-svelte/icons/search';
	import { createVirtualizer, defaultRangeExtractor } from '@tanstack/svelte-virtual';
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
		/** A group's header, pinned to the top of the viewport while its records scroll. */
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
		 * A list's own narrowing controls, rendered in the toolbar between the search and the
		 * result count.
		 *
		 * Search and order are every list's and are this block's own; what a list may be narrowed
		 * *by* is the concept's — a contract has an attention rank and a tenant has nothing like
		 * one — so the block gives the position and the concept gives the control.
		 */
		filters?: Snippet;
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
		filters,
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

	// written from `data` rather than from a fresh read: the file is what the list is showing,
	// under the search and the order it is showing it under.
	async function exportRows() {
		if (!exportAs || isExporting) return;

		isExporting = true;

		try {
			const path = await tauri.export.write(exportAs.name, toCsv(exportAs.columns, data));

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

	// the column count is measured rather than declared, because the shape it serves reflows:
	// the reader's window decides how many records fit, and the query knows nothing about it.
	const columns = $derived(
		recordMinWidth ? Math.max(1, Math.floor(viewportWidth / recordMinWidth)) : 1
	);
	// grouping without a header snippet would insert rows that render nothing and still take
	// up a header's height, so the two props only take effect as a pair.
	const rows = $derived(listRows(data, groupHeader ? groupOf : undefined, columns));
	const sortableColumnIds = $derived(sortOptions.map((option) => option.id));
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
	// the first row the reader can actually see, which is not the first row rendered: overscan
	// puts several above it, and a header chosen from those would belong to the group before.
	const firstVisibleRowIndex = $derived(
		$virtualizer.getVirtualItemForOffset($virtualizer.scrollOffset ?? 0)?.index ?? 0
	);
	const pinnedRowIndex = $derived(
		groupHeader ? stickyGroupRowIndex(rows, firstVisibleRowIndex) : null
	);

	$effect(() => {
		get(virtualizer).setOptions({
			count: rows.length,
			getScrollElement: () => viewport,
			estimateSize: (index) => (rows[index]?.kind === 'header' ? groupHeaderHeight : recordHeight),
			getItemKey: (index) => rows[index]?.key ?? index,
			// the pinned header has left its own scroll position, so the range no longer holds
			// it. Without this it unmounts and the group scrolls with nothing naming it.
			rangeExtractor: (range) => {
				const pinned = stickyGroupRowIndex(rows, range.startIndex);
				const visible = defaultRangeExtractor(range);

				return pinned === null || visible.includes(pinned) ? visible : [pinned, ...visible];
			},
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
	// staying at the old offset would leave the user somewhere they never scrolled to.
	$effect(() => {
		void search;
		void sort;

		void tick().then(() => {
			get(virtualizer).scrollToOffset(0);
		});
	});

	function chooseSort(columnId: string) {
		sort = nextListSort(sort, columnId, sortableColumnIds);
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<div
		class="flex shrink-0 flex-col gap-3 rounded-2xl bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="relative w-full sm:max-w-sm">
			<SearchIcon
				class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				placeholder={$LL.common.table.searchPlaceholder()}
				value={searchInput}
				oninput={(event) => {
					searchInput = event.currentTarget.value;
				}}
				class="h-8 border-transparent bg-transparent ps-9 hover:bg-input/30"
			/>
		</div>

		<div class="flex shrink-0 flex-wrap items-center gap-3">
			{@render filters?.()}
			<span class="text-xs text-muted-foreground" aria-live="polite">
				{$LL.common.table.results({ count: data.length })}
			</span>
			{#if sortOptions.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
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
			{#if exportAs}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.actions.export()}
								disabled={!hasResults || isExporting}
								onclick={exportRows}
							>
								<DownloadIcon />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.actions.export()}
					</Tooltip.Content>
				</Tooltip.Root>
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

	<div class="min-h-0 flex-1 overflow-hidden rounded-3xl border bg-background">
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
				class="app-scroll h-full overflow-y-auto"
				aria-busy={isFetching || undefined}
			>
				<div class="relative w-full" style={`height: ${totalHeight}px;`}>
					{#each virtualRows as virtualRow (virtualRow.key)}
						{@const row = rows[virtualRow.index]}
						{@const isPinned = virtualRow.index === pinnedRowIndex}
						{#if row}
							<div
								data-index={virtualRow.index}
								class={cn(
									// a row taller than it declared clips here rather than running into the
									// row below it, so an outgrown height is visible where it is caused.
									'overflow-hidden',
									isPinned ? 'sticky top-0 z-10 bg-background' : 'absolute start-0 top-0 w-full'
								)}
								style={`height: ${virtualRow.size}px;${
									isPinned ? '' : ` transform: translateY(${virtualRow.start}px);`
								}`}
							>
								{#if row.kind === 'header'}
									{@render groupHeader?.(row.group)}
								{:else if columns === 1}
									{@render record(row.records[0])}
								{:else}
									<div
										class="grid h-full"
										style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`}
									>
										{#each row.records as item (item.id)}
											{@render record(item)}
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
