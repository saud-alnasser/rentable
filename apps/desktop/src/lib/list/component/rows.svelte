<script lang="ts" generics="TData extends { id: string }, TGroup extends ListGroup">
	import type { ListGroup, ListRow } from '@rentable/design/group.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { VirtualItem } from '@tanstack/svelte-virtual';
	import type { Snippet } from 'svelte';

	import { toTransitionName } from '$lib/list/motion';
	import type { ListSelection } from '$lib/list/selection.svelte';

	/**
	 * The rows the virtualizer has laid out, in the list's scrolling viewport: group headers, and
	 * records one or several to a row, each in a cell of the list's own.
	 */
	let {
		viewport = $bindable(null),
		viewportWidth = $bindable(0),
		isFetching,
		totalHeight,
		virtualRows,
		rows,
		columns,
		rowGap,
		rowInset,
		listId,
		isMoving,
		selection,
		record,
		groupHeader
	}: {
		/** The scrolling element, which the virtualizer and the keyboard read. */
		viewport?: HTMLElement | null;
		/** Its width, which decides how many columns fit. */
		viewportWidth?: number;
		/** Whether a later result set is on its way. */
		isFetching: boolean;
		/** The height of every row laid end to end. */
		totalHeight: number;
		/** The rows in the rendered window. */
		virtualRows: VirtualItem[];
		/** Every row, laid out. */
		rows: ListRow<TData, TGroup>[];
		/** How many records a row holds. */
		columns: number;
		/** The space between one card and the next, as the row's own bottom padding. */
		rowGap: number;
		/** The inline space a card's shadow falls into. */
		rowInset: string;
		/** What scopes the transition names, so two lists on one screen can show the same record. */
		listId: string;
		/** Whether this list's own transition is capturing its records. */
		isMoving: boolean;
		/** What the reader has selected, and whether they are selecting. */
		selection: ListSelection;
		/** One record, as the concept that owns the data renders it. */
		record: Snippet<[TData]>;
		/** A group's header. */
		groupHeader?: Snippet<[TGroup]>;
	} = $props();
</script>

<!-- the keys are answered on the list rather than on the records, so a move works from the search
     field as well as from a card — the whole point being that one reader gets from typing to
     opening without leaving the keyboard. -->
{#snippet selectableRecord(item: TData)}
	{#if selection.isSelectable}
		<!-- the checkbox sits beside the card rather than on it: the card is the concept's and is
		     one tab stop that opens the record, and a control inside it would be a second thing to
		     press in the place a reader presses to open. -->
		<div class="flex h-full items-center gap-2">
			<!-- shift is read here rather than from the checkbox, which reports the state it is
			     moving to and nothing about what was held down to move it. -->
			<div
				onpointerdown={(event) => selection.holdShift(event.shiftKey)}
				onkeydown={(event) => selection.holdShift(event.shiftKey)}
				class="shrink-0"
				role="none"
			>
				<Checkbox
					checked={selection.selectedIds.has(item.id)}
					onCheckedChange={() => selection.choose(item.id)}
					aria-label={$LL.common.table.selectRecord()}
				/>
			</div>
			<div class="h-full min-w-0 flex-1">{@render record(item)}</div>
		</div>
	{:else}
		{@render record(item)}
	{/if}
{/snippet}

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
				<!-- the row is not clipped, and that is a trade rather than an oversight: the clip used
				     to make a card that outgrew its declared height visible where it was caused, and a
				     card that lifts on hover has to leave its row. The two cannot both hold, so an
				     outgrown card now overlaps the one below instead of being cut: still visible, and
				     still fixed by raising `recordHeight`. -->
				<div
					data-index={virtualRow.index}
					class={cn(rowInset, 'absolute start-0 top-0 w-full')}
					style={`height: ${virtualRow.size}px; padding-bottom: ${rowGap}px; transform: translateY(${virtualRow.start}px);`}
				>
					<!-- each record renders inside a cell of the block's own, so a move can name the
					     record it lands on and find it again in the document. Nothing else hangs off it:
					     the card is still the concept's, and the cell is the address. -->
					{#if row.kind === 'header'}
						<div
							class="h-full"
							style:view-transition-name={isMoving ? toTransitionName(listId, row.key) : undefined}
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
