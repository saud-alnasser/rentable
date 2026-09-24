<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import Empty from '@rentable/design/block/empty.svelte';
	import { listRows } from '@rentable/design/group.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import type PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';

	type AssignableUnit = Awaited<ReturnType<typeof api.contract.units.getAssignableMany>>[number];

	/**
	 * One side of a contract's unit transfer: a heading, and the units on that side.
	 *
	 * A component rather than a snippet in the surface above, because each side scrolls and each
	 * therefore needs a viewport and a virtualizer of its own — state a snippet cannot hold.
	 */
	let {
		heading,
		units,
		empty,
		label,
		icon,
		wasHeld,
		isLoading,
		isLocked,
		isTransferring,
		gridded = false,
		isSearched = false,
		onClearSearch,
		onTransfer
	}: {
		heading: string;
		units: AssignableUnit[];
		/** What to say where the side holds no units and nothing is searched. */
		empty: string;
		/** The transfer control's action, which names itself with the unit. */
		label: string;
		icon: typeof PlusIcon;
		/** which side these rows sit on — the only difference between the two panes. */
		wasHeld: boolean;
		isLoading: boolean;
		/** Whether the contract's units may still be changed. Locked hides the control. */
		isLocked: boolean;
		isTransferring: boolean;
		/**
		 * Whether to lay the units out across the pane's width rather than one to a line.
		 *
		 * Set where this pane is the only one on the surface. Two panes side by side are each too
		 * narrow to hold a second column, and a pane that is alone is twice as wide with the same
		 * cards in it.
		 */
		gridded?: boolean;
		/**
		 * Whether a search is narrowing the panes. An empty side under a search is a search that
		 * matched nothing, and says so rather than saying the side holds no units.
		 */
		isSearched?: boolean;
		/** Put the search down, offered where a search emptied the side. */
		onClearSearch?: () => void;
		onTransfer: (unitId: string, wasHeld: boolean) => void;
	} = $props();

	// the card's own height, and the space between one card and the next. The gap rides inside the
	// row as its bottom padding rather than as a margin, because the virtualizer lays rows out at a
	// declared height and never measures them — a margin would put every card slightly below where
	// the virtualizer believes it is, and the error would accumulate down the pane.
	const CARD_HEIGHT = 64;
	const ROW_GAP = 8;
	// the narrowest a card may be laid out at before the pane stops adding columns: a unit's name
	// over its complex's name, with a status glyph and a control beside them.
	const CARD_MIN_WIDTH = 240;
	const OVERSCAN_ROWS = 4;
	// the empty treatment at a pane's size: no screen's worth of padding, and no growing to fill.
	const PANE_EMPTY = 'h-auto flex-none gap-3 rounded-xl border border-dashed p-4 md:p-4';

	let viewport = $state<HTMLElement | null>(null);
	let viewportWidth = $state(0);

	// measured rather than declared, because the shape reflows: the reader's window decides how
	// many cards fit across, and nothing upstream of here knows the pane's width.
	const columns = $derived(gridded ? Math.max(1, Math.floor(viewportWidth / CARD_MIN_WIDTH)) : 1);
	const rows = $derived(listRows(units, undefined, columns));

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
			estimateSize: () => CARD_HEIGHT + ROW_GAP,
			getItemKey: (index) => rows[index]?.key ?? index,
			overscan: OVERSCAN_ROWS,
			enabled: browser && !!viewport
		});
	});

	const Icon = $derived(icon);
	// the heading counts in the reader's digits, like the list beside it and the complex above
	// it. The parentheses stay as they are: they are neutral characters, and the bidi algorithm
	// mirrors a matched pair inside an RTL heading without being asked.
	const count = $derived(formatLocaleNumber($locale, units.length));
</script>

{#snippet clearAct()}
	<Button type="button" variant="outline" size="sm" onclick={() => onClearSearch?.()}>
		<XIcon />
		{$LL.common.actions.clearSearch()}
	</Button>
{/snippet}

<section class="flex min-h-0 flex-col gap-2">
	<h3 class="shrink-0 text-xs text-muted-foreground uppercase">
		{heading}
		<span class="ms-1">({count})</span>
	</h3>

	{#if isLoading}
		<div class="flex flex-col gap-2">
			<Skeleton class="h-16 w-full rounded-xl" />
			<Skeleton class="h-16 w-full rounded-xl" />
		</div>
	{:else if units.length === 0}
		<!-- the one empty treatment ([[rules/interface]], *Empty*), sized to a pane rather than to a
		     screen: a side is half of one transfer, and a screen's worth of padding would push the
		     other side's units out of sight. -->
		{#if isSearched}
			<Empty
				kind="no-match"
				title={$LL.common.messages.noMatch()}
				class={PANE_EMPTY}
				action={onClearSearch ? clearAct : undefined}
			/>
		{:else}
			<Empty kind="nothing-yet" title={empty} class={PANE_EMPTY} />
		{/if}
	{:else}
		<div
			bind:this={viewport}
			bind:clientWidth={viewportWidth}
			class="min-h-0 flex-1 overflow-y-auto pe-1"
		>
			<div class="relative w-full" style={`height: ${totalHeight}px;`}>
				{#each virtualRows as virtualRow (virtualRow.key)}
					{@const row = rows[virtualRow.index]}
					{#if row?.kind === 'record'}
						<div
							class="absolute start-0 top-0 w-full"
							style={`height: ${virtualRow.size}px; padding-bottom: ${ROW_GAP}px; transform: translateY(${virtualRow.start}px);`}
						>
							<!-- the row's own columns, so a card never straddles the gap between two of
							     them. One column is the ordinary case and the grid collapses to it. -->
							<div
								class="grid h-full gap-2"
								style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`}
							>
								{#each row.records as unit (unit.id)}
									<div
										class="flex items-center gap-3 rounded-xl bg-muted p-3 transition-colors hover:bg-accent"
									>
										<a
											href={resolve(`/complexes/units/${unit.id}`)}
											class="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
										>
											<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
												<span class="truncate text-sm font-medium">{unit.name}</span>
												<span class="truncate text-xs text-muted-foreground">
													{unit.complexName}
												</span>
											</span>

											<Cell.Status status={unit.status} />
										</a>

										{#if !isLocked}
											<Button
												type="button"
												variant="outline"
												size="icon-sm"
												class="shrink-0"
												aria-label={`${label} ${unit.name}`}
												disabled={isTransferring}
												onclick={() => onTransfer(unit.id, wasHeld)}
											>
												<Icon class="size-4" />
											</Button>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</section>
