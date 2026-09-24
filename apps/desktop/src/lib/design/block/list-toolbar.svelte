<script lang="ts" module>
	/** One order the set offers the reader, keyed by what the set orders by. */
	export type ListSortOption = {
		/** The column's id, which is what the set orders by. */
		id: string;
		/** The name the sort control lists it under. */
		label: string;
	};
</script>

<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import { nextListSort, type ListSort } from '@rentable/design/sort.js';
	import SearchField from '$lib/design/block/search-field.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import type { Snippet } from 'svelte';

	/**
	 * The bar a searchable set opens with: its search at one end, and at the other what the set
	 * currently is and what can be done to it.
	 *
	 * **One bar for every set drawn as a directory.** The list shell draws it above its records,
	 * and the settings directories draw it above their cards, so a reader meets the same field,
	 * the same count and the same sort control in the same places on both
	 * ([[rules/interface]], *Search*). What a set may be narrowed by, and what it offers to do,
	 * are the set's own, handed in as snippets on either side of the sort.
	 *
	 * **The order at the far end is the list shell's**: the count, then what narrows (a filter,
	 * selecting), then the order, then what acts on the set (transfer, create). The count is what
	 * the set is; the controls after it are the things the bar does.
	 */
	let {
		search = $bindable(''),
		onSearch,
		count,
		sortOptions = [],
		sort = $bindable(null),
		narrowing,
		children
	}: {
		/** The search the set reads, already debounced by the field. */
		search?: string;
		/** Called at the moment a new term becomes the search. See `search-field.svelte`. */
		onSearch?: (term: string) => void;
		/** How many records the set is showing. */
		count: number;
		/** The orders the reader may choose between. A set that offers none gets no control. */
		sortOptions?: readonly ListSortOption[];
		/** The order the set is using, or `null` for its own. */
		sort?: ListSort | null;
		/** What narrows the set, drawn before the order. */
		narrowing?: Snippet;
		/** What acts on the set, drawn after the order. */
		children?: Snippet;
	} = $props();

	const sortableColumnIds = $derived(sortOptions.map((option) => option.id));
	const activeSortLabel = $derived(
		sortOptions.find((option) => option.id === sort?.columnId)?.label
	);

	function chooseSort(columnId: string) {
		sort = nextListSort(sort, columnId, sortableColumnIds);
	}
</script>

<!-- marked as the bar a set's create control ends: the control is the last thing at its end, on
     every set that draws this bar ([[rules/interface]], *Create*). -->
<div
	data-list-toolbar
	data-set-bar
	class="flex shrink-0 flex-col gap-3 rounded-2xl bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
>
	<SearchField bind:value={search} {onSearch} />

	<div data-set-bar-end class="flex shrink-0 flex-wrap items-center gap-3">
		<span class="text-xs text-muted-foreground" aria-live="polite" data-list-count>
			{$LL.common.table.results({ count })}
		</span>

		{@render narrowing?.()}

		{#if sortOptions.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<!-- filled while a sort is chosen, on the same rule as the filter beside it:
						     a control that decides which records the reader is looking at, or in
						     what order, says so by being filled. The export and create controls
						     stay outlined however often they are used, since they act on the set
						     rather than deciding what it holds. -->
						<Button
							{...props}
							variant={sort ? 'default' : 'outline'}
							size="icon-sm"
							aria-label={activeSortLabel
								? `${$LL.common.actions.sortBy()}: ${activeSortLabel}`
								: $LL.common.actions.sortBy()}
						>
							<ArrowUpDownIcon />
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

		{@render children?.()}
	</div>
</div>
