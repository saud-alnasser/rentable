<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	import { listRows } from '@rentable/design/group.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import type PlusIcon from '@lucide/svelte/icons/plus';
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
		onTransfer
	}: {
		heading: string;
		units: AssignableUnit[];
		/** What to say where the side is empty. */
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
</script>

<section class="flex min-h-0 flex-col gap-2">
	<h3 class="shrink-0 text-xs tracking-[0.2em] text-muted-foreground uppercase">
		{heading}
		<span class="ms-1 tracking-normal">({units.length})</span>
	</h3>

	{#if isLoading}
		<div class="flex flex-col gap-2">
			<Skeleton class="h-16 w-full rounded-xl" />
			<Skeleton class="h-16 w-full rounded-xl" />
		</div>
	{:else if units.length === 0}
		<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
			{empty}
		</p>
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
