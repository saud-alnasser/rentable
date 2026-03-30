<script lang="ts" generics="TData extends { id: number }">
	import { Button } from '$lib/common/components/fragments/button';
	import { Input } from '$lib/common/components/fragments/input';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { IconPlus } from '@tabler/icons-svelte';
	import type { Snippet } from 'svelte';

	type DataViewProps<TData> = {
		data: TData[];
		isLoading?: boolean;
		isFetching?: boolean;
		onCreate?: () => Promise<void> | void;
		getSearchValue: (item: TData) => string;
		item: Snippet<[TData]>;
		emptyTitle?: string;
		emptyDescription?: string;
		skeletonCount?: number;
		class?: string;
	};

	let {
		data,
		isLoading = false,
		isFetching = false,
		onCreate,
		getSearchValue,
		item,
		emptyTitle = $LL.common.messages.noResults(),
		emptyDescription,
		skeletonCount = 6,
		class: className
	}: DataViewProps<TData> = $props();

	let search = $state('');
	let normalizedSearch = $derived(search.trim().toLowerCase());
	let filteredData = $derived.by(() => {
		if (!normalizedSearch) return data;

		return data.filter((record) => getSearchValue(record).toLowerCase().includes(normalizedSearch));
	});

	let showLoadingState = $derived(!data.length && !normalizedSearch && (isLoading || isFetching));
	let showRefreshingIndicator = $derived(!showLoadingState && isFetching && data.length > 0);
</script>

<div class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
	<Input
		placeholder={$LL.common.table.searchPlaceholder()}
		value={search}
		oninput={(event) => {
			search = event.currentTarget.value;
		}}
		class="w-full sm:max-w-sm"
	/>
	{#if onCreate}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="icon-sm"
						class="shrink-0 self-start"
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

{#if showLoadingState}
	<div class={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)} aria-busy="true">
		<span class="sr-only">{$LL.common.messages.loadingApp()}</span>
		{#each Array.from({ length: skeletonCount }), index (index)}
			<div class="rounded-xl border bg-card p-6 shadow-sm">
				<div class="space-y-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1 space-y-2">
							<Skeleton class="h-5 w-2/3" />
							<Skeleton class="h-4 w-1/2" />
						</div>
						<Skeleton class="size-8 rounded-md" />
					</div>
					<Skeleton class="h-20 w-full rounded-xl" />
					<div class="grid gap-3 sm:grid-cols-2">
						<Skeleton class="h-16 w-full rounded-lg" />
						<Skeleton class="h-16 w-full rounded-lg" />
					</div>
				</div>
			</div>
		{/each}
	</div>
{:else if filteredData.length > 0}
	{#if showRefreshingIndicator}
		<div class="mb-3 overflow-hidden rounded-full bg-muted/40">
			<div class="h-1.5 w-1/3 animate-pulse rounded-full bg-primary/60"></div>
		</div>
	{/if}
	<div
		class={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className, isFetching && 'opacity-80')}
		aria-busy={isFetching}
	>
		{#each filteredData as record (record.id)}
			{@render item(record)}
		{/each}
	</div>
{:else}
	<div class="rounded-xl border border-dashed bg-card/40 p-8 text-center shadow-sm">
		<p class="text-sm font-medium">{emptyTitle}</p>
		{#if emptyDescription}
			<p class="mt-2 text-sm text-muted-foreground">{emptyDescription}</p>
		{/if}
	</div>
{/if}
