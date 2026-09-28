<script lang="ts">
	import EmptyState, { type EmptyKind } from '@rentable/design/block/empty.svelte';
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * What the list says where it shows nothing: the one empty treatment ([[rules/interface]],
	 * *Empty*). Nothing yet says what the list will hold and offers the create the toolbar offers;
	 * a narrowing that matched nothing says so and offers to put the narrowing down.
	 */
	let {
		listId,
		isSearched,
		isFiltered,
		onClear,
		title,
		description,
		onCreate,
		createLabel,
		createUnavailable
	}: {
		/** What scopes the refused create's reason id. */
		listId: string;
		/** Whether the list is read under a search. */
		isSearched: boolean;
		/** Whether the list is read under a filter. */
		isFiltered: boolean;
		/** Put down whatever narrowed the list to nothing. */
		onClear: () => void;
		/** The concept's words for what the list will hold. */
		title: string;
		/** A line under it, saying where the records come from. */
		description?: string;
		/** The list's create, as the toolbar offers it. */
		onCreate?: () => void;
		/** What the create makes, in the concept's words. */
		createLabel?: string;
		/** Why the set takes no new record right now, or nothing where it does. */
		createUnavailable?: string;
	} = $props();

	// what names the empty state's refused create to assistive technology, whether or not its
	// tooltip is drawn.
	const emptyCreateReasonId = $derived(`${listId}-create-reason`);
	// an empty list read under a search or a filter is a narrowing that matched nothing, and says
	// so; read under neither, it is a list with nothing in it yet. The two never read the same.
	const emptyKind = $derived<EmptyKind>(isSearched || isFiltered ? 'no-match' : 'nothing-yet');
	const clearLabel = $derived(
		isSearched && isFiltered
			? $LL.common.actions.clearSearchAndFilters()
			: isSearched
				? $LL.common.actions.clearSearch()
				: $LL.common.actions.clearFilters()
	);
</script>

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

{#if emptyKind === 'no-match'}
	<EmptyState kind="no-match" title={$LL.common.messages.noMatch()}>
		{#snippet action()}
			<Button variant="outline" size="sm" onclick={onClear}>
				<XIcon />
				{clearLabel}
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<EmptyState kind="nothing-yet" {title} {description} action={onCreate ? createAct : undefined} />
{/if}
