<script lang="ts" generics="TData extends { id: number }">
	import { browser } from '$app/environment';
	import { Button } from '$lib/common/components/fragments/button';
	import { Input } from '$lib/common/components/fragments/input';
	import { ScrollArea } from '$lib/common/components/fragments/scroll-area';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind';
	import { LL } from '$lib/i18n/i18n-svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { IconPlus } from '@tabler/icons-svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { tick, type Snippet } from 'svelte';
	import { get } from 'svelte/store';

	type DataViewProps<TData> = {
		data: TData[];
		isLoading?: boolean;
		isFetching?: boolean;
		hasNextPage?: boolean;
		isFetchingNextPage?: boolean;
		fetchNextPage?: () => Promise<unknown> | unknown;
		searchValue?: string;
		onCreate?: () => Promise<void> | void;
		getSearchValue: (item: TData) => string;
		item: Snippet<[TData]>;
		emptyTitle?: string;
		emptyDescription?: string;
		virtualItemHeight?: number;
		virtualViewportHeight?: string;
		virtualOverscanRows?: number;
		virtualThreshold?: number;
		class?: string;
	};

	let {
		data,
		isLoading = false,
		isFetching = false,
		hasNextPage = false,
		isFetchingNextPage = false,
		fetchNextPage,
		searchValue = $bindable(''),
		onCreate,
		getSearchValue,
		item,
		emptyTitle = $LL.common.messages.noResults(),
		emptyDescription,
		virtualItemHeight,
		virtualViewportHeight = 'min(72vh, 56rem)',
		virtualOverscanRows = 2,
		virtualThreshold = 3,
		class: className
	}: DataViewProps<TData> = $props();

	const searchDebounceMs = 250;
	const loadingIndicatorDelayMs = 1000;
	const rowGap = 16;
	const virtualContentPaddingClass = 'p-2 sm:p-3';
	const nonVirtualBottomSpacingClass = 'pb-3 sm:pb-4';

	let viewportRef = $state<HTMLElement | null>(null);
	let loadMoreRef = $state<HTMLDivElement | null>(null);
	let viewportWidth = $state(0);
	let windowWidth = $state(browser ? window.innerWidth : 0);
	let searchInputValue = $state(searchValue);
	let lastCommittedSearchValue = $state(searchValue);
	let showDelayedLoadingIndicator = $state(false);

	let normalizedSearch = $derived(searchValue.trim().toLowerCase());
	let filteredData = $derived.by(() => {
		if (!normalizedSearch) return data;

		return data.filter((record) => getSearchValue(record).toLowerCase().includes(normalizedSearch));
	});

	let isBodyLoading = $derived((isLoading || isFetching) && !isFetchingNextPage);
	let isWaitingForResults = $derived(!filteredData.length && isBodyLoading);
	let showLoadingState = $derived(isWaitingForResults && showDelayedLoadingIndicator);
	let showLoadingBuffer = $derived(isWaitingForResults && !showDelayedLoadingIndicator);
	let resolvedVirtualItemHeight = $derived(virtualItemHeight ?? 0);
	let shouldUseVirtualLayout = $derived(
		resolvedVirtualItemHeight > 0 && filteredData.length >= virtualThreshold
	);
	let isVirtualizerReady = $derived(shouldUseVirtualLayout && !!viewportRef && viewportWidth > 0);
	let layoutWidth = $derived(viewportWidth || windowWidth);
	let columnCount = $derived.by(() => {
		if (layoutWidth >= 1280) return 3;
		if (layoutWidth >= 768) return 2;

		return 1;
	});
	let gridTemplateStyle = $derived(
		`grid-template-columns: repeat(${columnCount}, minmax(0, 1fr));`
	);
	let totalRows = $derived(Math.ceil(filteredData.length / columnCount));
	let rows = $derived.by(() =>
		Array.from({ length: totalRows }, (_, rowIndex) =>
			filteredData.slice(rowIndex * columnCount, (rowIndex + 1) * columnCount)
		)
	);
	let rowMeasureKeys = $derived.by(() =>
		rows.map((row) => row.map((record) => String(record.id)).join(':'))
	);

	const virtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => null,
		estimateSize: () => 1,
		overscan: 2,
		gap: rowGap,
		enabled: false
	});
	let virtualRows = $derived($virtualizer.getVirtualItems());
	let virtualPaddingTop = $derived(virtualRows[0]?.start ?? 0);
	let virtualPaddingBottom = $derived(
		Math.max($virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0), 0)
	);

	$effect(() => {
		if (!browser || !viewportRef) {
			viewportWidth = 0;
			return;
		}

		const viewport = viewportRef;
		const syncViewportMetrics = () => {
			viewportWidth = viewport.clientWidth;
		};

		syncViewportMetrics();

		const resizeObserver = new ResizeObserver(syncViewportMetrics);
		resizeObserver.observe(viewport);
		viewport.addEventListener('scroll', syncViewportMetrics, { passive: true });

		return () => {
			resizeObserver.disconnect();
			viewport.removeEventListener('scroll', syncViewportMetrics);
		};
	});

	$effect(() => {
		get(virtualizer).setOptions({
			count: totalRows,
			getScrollElement: () => viewportRef,
			estimateSize: () => Math.max(resolvedVirtualItemHeight, 1),
			getItemKey: (index) => rowMeasureKeys[index] || index,
			overscan: virtualOverscanRows,
			gap: rowGap,
			enabled: browser && isVirtualizerReady
		});
	});

	$effect(() => {
		if (!browser) return;

		const syncWindowWidth = () => {
			windowWidth = window.innerWidth;
		};

		syncWindowWidth();
		window.addEventListener('resize', syncWindowWidth, { passive: true });

		return () => {
			window.removeEventListener('resize', syncWindowWidth);
		};
	});

	$effect(() => {
		if (searchValue === lastCommittedSearchValue) return;

		lastCommittedSearchValue = searchValue;
		searchInputValue = searchValue;
	});

	$effect(() => {
		const nextSearchValue = searchInputValue;
		if (nextSearchValue === searchValue) return;

		const timeout = setTimeout(() => {
			lastCommittedSearchValue = nextSearchValue;
			searchValue = nextSearchValue;
		}, searchDebounceMs);

		return () => clearTimeout(timeout);
	});

	$effect(() => {
		if (!isWaitingForResults) {
			showDelayedLoadingIndicator = false;
			return;
		}

		const timeout = setTimeout(() => {
			showDelayedLoadingIndicator = true;
		}, loadingIndicatorDelayMs);

		return () => {
			clearTimeout(timeout);
			showDelayedLoadingIndicator = false;
		};
	});

	$effect(() => {
		if (!isVirtualizerReady) return;

		columnCount;
		rowMeasureKeys;

		void tick().then(() => {
			get(virtualizer).measure();
		});
	});

	$effect(() => {
		if (!isVirtualizerReady || !viewportRef) return;

		normalizedSearch;

		void tick().then(() => {
			const instance = get(virtualizer);
			instance.scrollToOffset(0);
			instance.measure();
		});
	});

	$effect(() => {
		if (!browser || !loadMoreRef || !hasNextPage || isFetchingNextPage || !fetchNextPage) return;
		if (shouldUseVirtualLayout && !viewportRef) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					void Promise.resolve(fetchNextPage());
				}
			},
			{
				root: shouldUseVirtualLayout ? viewportRef : null,
				rootMargin: shouldUseVirtualLayout ? '0px 0px 320px 0px' : '0px 0px 480px 0px'
			}
		);

		observer.observe(loadMoreRef);

		return () => {
			observer.disconnect();
		};
	});

	function measureRow(node: HTMLDivElement, _rowKey: string) {
		const instance = get(virtualizer);
		instance.measureElement(node);

		return {
			update() {
				instance.measureElement(node);
			},
			destroy() {
				instance.measureElement(null);
			}
		};
	}
</script>

<div class={cn('flex flex-col gap-3', shouldUseVirtualLayout && 'min-h-0 flex-1')}>
	<div
		class="flex shrink-0 flex-col gap-3 rounded-[1.1rem] border border-border/50 bg-card/24 px-3 py-2.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="relative w-full sm:max-w-sm">
			<SearchIcon
				class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				placeholder={$LL.common.table.searchPlaceholder()}
				value={searchInputValue}
				oninput={(event) => {
					searchInputValue = event.currentTarget.value;
				}}
				class="h-9 border-transparent bg-transparent ps-9 shadow-none hover:bg-background/18 focus-visible:border-border/60 focus-visible:bg-background/28"
			/>
		</div>
		{#if onCreate}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							size="icon-sm"
							class="shrink-0 self-start border-border/55 bg-background/28 shadow-none sm:self-auto"
							aria-label={$LL.common.actions.newRecord()}
							onclick={() => onCreate()}
						>
							<IconPlus class="size-4" />
							<span class="sr-only">{$LL.common.actions.newRecord()}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}>
					{$LL.common.actions.newRecord()}
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>

	<div class={cn(shouldUseVirtualLayout && 'min-h-0 flex-1')}>
		{#if showLoadingState}
			<div
				class={cn(
					'flex items-center justify-center',
					shouldUseVirtualLayout ? 'h-full min-h-0' : 'min-h-32'
				)}
				aria-busy="true"
			>
				<div
					class="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
				></div>
				<span class="sr-only">{$LL.common.messages.loadingApp()}</span>
			</div>
		{:else if showLoadingBuffer}
			<div class={cn(shouldUseVirtualLayout ? 'h-full min-h-0' : 'min-h-32')} aria-busy="true">
				<span class="sr-only">{$LL.common.messages.loadingApp()}</span>
			</div>
		{:else if filteredData.length > 0}
			{#if shouldUseVirtualLayout}
				<ScrollArea
					bind:viewportRef
					class="h-full rounded-[1.1rem] border border-border/35 bg-card/18 backdrop-blur-sm"
					style={`height: min(${virtualViewportHeight}, 100%);`}
				>
					{#if isVirtualizerReady}
						<div class={cn('relative w-full', virtualContentPaddingClass)}>
							{#if virtualPaddingTop > 0}
								<div aria-hidden="true" style={`height: ${virtualPaddingTop}px;`}></div>
							{/if}
							<div class="flex flex-col gap-4">
								{#each virtualRows as virtualRow (virtualRow.key)}
									<div
										use:measureRow={rowMeasureKeys[virtualRow.index] ?? ''}
										data-index={virtualRow.index}
										class="w-full"
									>
										<div
											class={cn('grid gap-4', className)}
											style={gridTemplateStyle}
											aria-busy={isBodyLoading}
										>
											{#each rows[virtualRow.index] ?? [] as record (record.id)}
												{@render item(record)}
											{/each}
										</div>
									</div>
								{/each}
							</div>
							{#if virtualPaddingBottom > 0}
								<div aria-hidden="true" style={`height: ${virtualPaddingBottom}px;`}></div>
							{/if}
							{#if hasNextPage}
								<div
									bind:this={loadMoreRef}
									class="absolute right-0 bottom-0 left-0 h-px w-full"
								></div>
							{/if}
						</div>
					{:else}
						<div
							class={cn(
								'grid gap-4',
								virtualContentPaddingClass,
								nonVirtualBottomSpacingClass,
								className
							)}
							style={gridTemplateStyle}
							aria-busy={isBodyLoading}
						>
							{#each filteredData as record (record.id)}
								{@render item(record)}
							{/each}
						</div>
						{#if hasNextPage}
							<div bind:this={loadMoreRef} class="h-px w-full"></div>
						{/if}
					{/if}
				</ScrollArea>
			{:else}
				<div
					class={cn('grid gap-4', nonVirtualBottomSpacingClass, className)}
					style={gridTemplateStyle}
					aria-busy={isBodyLoading}
				>
					{#each filteredData as record (record.id)}
						{@render item(record)}
					{/each}
				</div>
				{#if hasNextPage}
					<div bind:this={loadMoreRef} class="h-px w-full"></div>
				{/if}
			{/if}
			{#if isFetchingNextPage}
				<div class="mt-3 flex justify-center" aria-busy="true">
					<div class="h-1.5 w-24 animate-pulse rounded-full bg-primary/60"></div>
					<span class="sr-only">{$LL.common.messages.loadingApp()}</span>
				</div>
			{/if}
		{:else}
			<div
				class="rounded-[1.25rem] border border-dashed border-border/70 bg-card/30 p-8 text-center shadow-sm backdrop-blur-md"
			>
				<p class="text-sm font-medium">{emptyTitle}</p>
				{#if emptyDescription}
					<p class="mt-2 text-sm text-muted-foreground">{emptyDescription}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
