<script lang="ts" module>
	/**
	 * How tall a complex's tile is, which the list lays the grid out at rather than measuring.
	 *
	 * Fixed by ticket 15 of effort 846 on the development workspace in both locales: the heading
	 * line (32), the location and the counts at 20 apiece, the gaps between and the padding. It
	 * holds only because every fact line sets its own leading (`leading-5`); at the inherited
	 * leading an Arabic line is 22 px and the tile overflows onto the one below.
	 */
	export const COMPLEX_TILE_HEIGHT = 120;
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
	 * A complex as a tile in the directory's grid: its name, where it is, and how many units it
	 * holds, how many of them are occupied and how many vacant.
	 *
	 * A fact is a `Cell.Fact` line, its glyph small and dimmed so the glyphs do not outweigh the
	 * words (_Balance weight and contrast_). A count carries its word rather than a
	 * label (_Labels are a last resort_), and a count of zero is left out, since a figure of
	 * nothing is a line the reader reads to learn nothing. The counts sit at the tile's foot, so the
	 * location and the counts read as two groups (_Avoid ambiguous spacing_).
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

	// a reader who may not view units is answered with no counts at all, and the tile draws none
	// rather than reading as an empty complex (effort 838, requirement 10).
	const counted = $derived(
		complex.unitCount !== undefined && complex.vacantUnitCount !== undefined
	);
	const unitCount = $derived(complex.unitCount ?? 0);
	const vacantUnitCount = $derived(complex.vacantUnitCount ?? 0);
	// occupancy is not on the query: a unit is occupied or vacant, so the third figure is the
	// other two.
	const occupiedUnitCount = $derived(unitCount - vacantUnitCount);
</script>

<RecordCard {href} label={complex.name} {actions} layout="tile">
	{#snippet heading()}
		<Cell.Text class="truncate text-sm font-semibold" text={complex.name} />
	{/snippet}

	{#snippet content()}
		{#if complex.location}
			<Cell.Fact icon={MapPinIcon}>
				<Cell.Text class="truncate" text={complex.location} />
			</Cell.Fact>
		{/if}

		{#if counted && unitCount > 0}
			<span
				class="pointer-events-none relative mt-auto flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap"
			>
				<Cell.Fact icon={LayoutGridIcon} class="shrink-0">
					{$LL.complexes.card.units({ count: unitCount })}
				</Cell.Fact>

				{#if occupiedUnitCount > 0}
					<Cell.Fact icon={statusGlyphs.occupied} class="shrink-0 text-primary">
						{$LL.complexes.card.occupied({ count: occupiedUnitCount })}
					</Cell.Fact>
				{/if}

				{#if vacantUnitCount > 0}
					<Cell.Fact icon={statusGlyphs.vacant} class="shrink-0">
						{$LL.complexes.card.vacant({ count: vacantUnitCount })}
					</Cell.Fact>
				{/if}
			</span>
		{/if}
	{/snippet}
</RecordCard>
