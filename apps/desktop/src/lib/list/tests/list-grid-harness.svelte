<script lang="ts">
	/**
	 * The list block laid as a grid of tiles, the way a directory turns the grid on.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the block takes
	 * a snippet and needs the providers. Each record is a tile as a concept draws one: its name and
	 * its labelled status on the heading line, a fact with its icon below, and one act on both of
	 * the card's routes. Selection is offered where a test asks for it.
	 */
	import List from '$lib/list/component/list.svelte';
	import { RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import Providers from '#tests/providers.svelte';
	import * as Cell from '$lib/design/cell/index.ts';
	import { placeholderStrings as strings } from '$lib/design/tests/strings';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';

	type Tile = { id: string; name: string; place: string };

	let {
		data,
		isLoading = false,
		selectable = false
	}: {
		data: Tile[];
		isLoading?: boolean;
		/** whether the list offers selection, which a grid lays beside each tile. */
		selectable?: boolean;
	} = $props();

	let search = $state('');
	let selected = $state<string[]>([]);

	const actions: RecordCardAction[] = [{ label: 'edit', icon: SquarePenIcon, onSelect: () => {} }];
</script>

{#snippet bulk()}
	<span>bulk</span>
{/snippet}

<Providers {strings} direction="ltr">
	<List
		{data}
		{isLoading}
		bind:search
		bind:selected
		recordMinWidth={RECORD_TILE_MIN_WIDTH}
		recordHeight={120}
		selectionActions={selectable ? bulk : undefined}
		emptyTitle="nothing here yet"
	>
		{#snippet record(tile: Tile)}
			<RecordCard href={`/tiles/${tile.id}`} label={tile.name} {actions} layout="tile">
				{#snippet heading()}
					<Cell.Text class="truncate text-sm font-medium" text={tile.name} />
					<Cell.Status status="active" labelled />
				{/snippet}
				{#snippet content()}
					<span
						data-fact
						class="pointer-events-none relative flex items-center gap-1.5 text-xs text-muted-foreground"
					>
						<MapPinIcon class="size-3.5" aria-hidden="true" />
						<Cell.Text class="truncate" text={tile.place} />
					</span>
				{/snippet}
			</RecordCard>
		{/snippet}
	</List>
</Providers>
