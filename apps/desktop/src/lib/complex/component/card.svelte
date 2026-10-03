<script lang="ts" module>
	/**
	 * How tall a complex's tile is, which the list lays the grid out at rather than measuring.
	 *
	 * Counted the way the member's tile is (effort 846, ticket 43): the padding (32), the heading
	 * line at the control's height (32), then 12 px to the fields, two rows of fields 8 px apart,
	 * each field 8 px of padding above and below a name and a value at a fixed 20 px leading
	 * (8 + 20 + 20 + 8 = 56). 32 + 32 + 12 + (56 + 8 + 56) = 196. The second row is counted whether
	 * or not it draws, so every tile in the directory stands at one height. It holds in Arabic only
	 * because every line sets its own leading, so a line added to the tile, or one drawn without
	 * it, changes this figure too.
	 */
	export const COMPLEX_TILE_HEIGHT = 196;
</script>

<script lang="ts">
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	// the occupied and vacant counts wear the glyphs the unit's own status wears, so a count and
	// the status it counts read as the same mark.
	import { statusGlyphs } from '$lib/design/cell/status.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';

	type ComplexRecord = Awaited<ReturnType<typeof api.complex.getMany>>[number];

	/**
	 * A complex as a tile in the directory's grid, in the member card's family (effort 846, ticket
	 * 43, at the human's word of 2026-10-03): its name as the one strong line, then its facts as
	 * tinted fields two across, each a `Cell.Field` holding its glyph and its name over the value.
	 *
	 * **The location and the units fill the first row, occupied and vacant the second**, so the
	 * split of the units reads under the figure it splits. A count is its figure under the field's
	 * name, the name being the term's own key. Occupied takes its status's tone, the one place a
	 * value here is a state the reader scans for; vacant does not, since its tone is the muted one
	 * and would read as a value saying nothing.
	 *
	 * **A count of zero is said in words and muted, not left out.** Every tile then holds its four
	 * fields in the same places, so a reader running down the grid finds *vacant* where it was on
	 * the tile above, and an empty complex reads as one rather than as a tile missing its counts
	 * (_Emphasize by de-emphasizing_, 46). No zero is drawn as a figure.
	 *
	 * **A reader who may not view units** is answered with no counts at all, and the tile draws
	 * the location alone rather than reading as an empty complex (effort 838, requirement 10).
	 */
	let {
		complex,
		href,
		actions
	}: {
		complex: ComplexRecord;
		/** where the tile opens, already resolved. */
		href: string;
		/** what the complex offers, on the tile's control and its context gesture. */
		actions: RecordCardAction[];
	} = $props();

	const counted = $derived(
		complex.unitCount !== undefined && complex.vacantUnitCount !== undefined
	);
	const unitCount = $derived(complex.unitCount ?? 0);
	const vacantUnitCount = $derived(complex.vacantUnitCount ?? 0);
	// occupancy is not on the query: a unit is occupied or vacant, so the third figure is the
	// other two.
	const occupiedUnitCount = $derived(unitCount - vacantUnitCount);

	const said = (count: number) =>
		count === 0 ? $LL.complexes.card.none() : $LL.complexes.card.count({ count });
</script>

<RecordCard {href} label={complex.name} {actions} layout="tile" class="gap-3">
	{#snippet heading()}
		<Cell.Text class="truncate text-sm font-semibold" text={complex.name} />
	{/snippet}

	{#snippet content()}
		<div data-complex-fields class="pointer-events-none relative grid grid-cols-2 gap-2">
			<Cell.Field hook="complex-field" icon={MapPinIcon} name={$LL.common.labels.location()}>
				<Cell.Text text={complex.location} />
			</Cell.Field>

			{#if counted}
				<Cell.Field
					hook="complex-field"
					icon={LayoutGridIcon}
					name={$LL.common.labels.units()}
					value={said(unitCount)}
					empty={unitCount === 0}
					valueAttributes={{ 'data-complex-units': unitCount }}
				/>

				<Cell.Field
					hook="complex-field"
					icon={statusGlyphs.occupied}
					name={$LL.common.status.occupied()}
					value={said(occupiedUnitCount)}
					empty={occupiedUnitCount === 0}
					status="occupied"
					valueAttributes={{ 'data-complex-occupied': occupiedUnitCount }}
				/>

				<Cell.Field
					hook="complex-field"
					icon={statusGlyphs.vacant}
					name={$LL.common.status.vacant()}
					value={said(vacantUnitCount)}
					empty={vacantUnitCount === 0}
					valueAttributes={{ 'data-complex-vacant': vacantUnitCount }}
				/>
			{/if}
		</div>
	{/snippet}
</RecordCard>
