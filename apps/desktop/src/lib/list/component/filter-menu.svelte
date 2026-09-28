<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import FunnelIcon from '@lucide/svelte/icons/funnel';

	import {
		toChosenOption,
		toFilterLabel,
		toFilterOptions,
		withFilter,
		type FilterSelection,
		type ListFilter
	} from '$lib/list/filter';

	/**
	 * One narrowing the list offers, drawn in the list's toolbar. Every filter a list declares is
	 * drawn by this, so they all look and answer the same way (`filter.ts`).
	 */
	let {
		filter,
		filters = $bindable({})
	}: {
		/** The narrowing, as the concept declared it. */
		filter: ListFilter;
		/** What the list is narrowed to, which choosing a value here changes. */
		filters?: FilterSelection;
	} = $props();

	const chosen = $derived(toChosenOption(filter, filters));
</script>

<!-- an icon, like the sort control beside it: both are ways of asking the same list a narrower
     question, and one of them wearing a word made the toolbar read as though they were different
     kinds of thing.

     A narrowed list says so by the control being filled rather than by printing the value beside
     it. What it is narrowed *to* is on the menu, checked — and it is also the control's accessible
     name, so a reader who cannot see the fill is told the value rather than that a filter
     exists. -->
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
						// choosing what is already chosen clears it, so the menu needs no entry of its
						// own for "all" and the vocabulary is the whole list.
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

			<!-- an entry of its own rather than only the toggle above it: pressing the chosen value
			     again clears it, but nothing on the screen says so, and a reader who cannot get back
			     to the whole list is stuck inside a subset.

			     No glyph before it: the values above it carry none, and a menu whose items carry
			     icons carries them on every item or on none. -->
			{#if chosen}
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={() => (filters = withFilter(filters, filter.id, undefined))}>
					<span class="flex-1">{$LL.common.actions.clearFilter()}</span>
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
