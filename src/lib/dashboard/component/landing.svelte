<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Cell from '$lib/design/cell';
	import * as Empty from '$lib/design/primitive/empty';
	import { Spinner } from '$lib/design/primitive/spinner';
	import { toDashboardSections } from '$lib/dashboard/dashboard';
	import { useFetchContractWorkQueue } from '$lib/dashboard/query';
	import DashboardSectionCard from '$lib/dashboard/component/section.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleRangeWithUnit } from '$lib/platform/locale';
	import CoinIcon from '@tabler/icons-svelte/icons/coin';

	/**
	 * The landing screen: a band of routed figures over one section of records per attention rank
	 * (ADR 0030).
	 *
	 * What may join it is a stated test — **a figure routes somewhere, or a section holds rows** —
	 * and it is the load-bearing half of that decision. ADR 0014 deleted thirteen portfolio figures
	 * from this screen for going unread; anything added here that neither opens a page nor lists
	 * records is the beginning of that happening again.
	 */
	const workQueueQuery = useFetchContractWorkQueue();
	const workQueue = $derived(workQueueQuery.data);

	const money = $derived(workQueue?.summary.money);
	const occupancy = $derived(workQueue?.summary.occupancy);
	const ranks = $derived(workQueue?.ranks ?? []);

	const sections = $derived(toDashboardSections(ranks, workQueue?.queue ?? []));

	// the debt across every rank that carries one. A renewals rank totals zero by construction,
	// so summing all three states the portfolio's outstanding rather than a subset of it.
	const outstanding = $derived(ranks.reduce((sum, rank) => sum + rank.totalAmount, 0));

	// through the range formatter rather than a message with two placeholders: bare numbers are
	// Latin digits whatever the locale, and two of those either side of a slash are reordered by
	// Arabic into `total / occupied` — the same pair, stating the opposite.
	const occupiedOfTotal = $derived(
		formatLocaleRangeWithUnit(
			$locale,
			occupancy?.occupiedUnits ?? 0,
			occupancy?.totalUnits ?? 0,
			$LL.common.labels.units()
		)
	);
</script>

<!-- no scroller of its own: the frame already owns one, and a second inside it splits the wheel
     between two regions that each look like the page. Everything below grows to its natural
     height and the frame scrolls it.

     The last card gets room of its own rather than relying on the route's padding — the band's
     negative top margin is inside this column, and the two were cancelling. -->
<div class="flex flex-1 flex-col gap-4 pb-6">
	<!-- every figure here is a door: the band states how the month is going, and each way in lands
	     on the page holding the detail behind it. It pins to the top of the scrollport so the month
	     stays readable while the sections are worked — the bleed and the background are what stop
	     rows showing through it once it is pinned.

	     It pins only where there is room to: stacked one to a line on a narrow window it is most
	     of a short screen, and a band pinned over the work it is meant to sit above is worse than
	     one that scrolls away. -->
	<div
		class="-mx-5 -mt-5 grid gap-3 bg-background px-5 pt-5 pb-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 sm:sticky sm:top-0 sm:z-10 sm:grid-cols-2 shell:grid-cols-3"
	>
		<a
			href={resolve('/contracts')}
			class="flex items-center justify-around gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
		>
			<span class="flex flex-col items-center gap-2">
				<Cell.Ring
					size="hero"
					value={money?.collectedThisMonth ?? 0}
					total={money?.dueThisMonth ?? 0}
				/>
				<span class="text-center text-xs text-muted-foreground">
					{$LL.dashboard.figures.collectedThisMonth()}
				</span>
			</span>
			<span class="flex min-w-0 flex-col gap-1 text-start">
				<span class="truncate text-sm font-semibold tabular-nums">
					<Cell.Money amount={money?.collectedThisMonth ?? 0} />
				</span>
				<span class="truncate text-xs text-muted-foreground tabular-nums">
					<Cell.Money amount={money?.dueThisMonth ?? 0} />
				</span>
			</span>
		</a>

		<a
			href={resolve('/complexes')}
			class="flex items-center justify-around gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
		>
			<span class="flex flex-col items-center gap-2">
				<Cell.Ring
					size="hero"
					value={occupancy?.occupiedUnits ?? 0}
					total={occupancy?.totalUnits ?? 0}
				/>
				<span class="text-center text-xs text-muted-foreground">
					{$LL.dashboard.figures.occupiedUnits()}
				</span>
			</span>
			<span class="flex min-w-0 flex-col gap-1 text-start">
				<span class="truncate text-sm font-semibold tabular-nums">{occupiedOfTotal}</span>
			</span>
		</a>

		<a
			href={resolve('/contracts')}
			class="flex flex-col justify-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
		>
			<!-- outstanding is a total rather than a proportion — there is nothing it is a share of
			     — so it is the one figure in the band that is not a ring.

			     Its glyph shares a line with its name so the figure gets the card's whole width: a
			     portfolio's debt runs to seven digits and a unit, which does not fit beside a glyph
			     at three columns, and a headline figure that ends in an ellipsis states nothing. -->
			<span class="flex items-center gap-3">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
				>
					<CoinIcon class="size-4.5" aria-hidden="true" />
				</span>
				<span class="truncate text-xs text-muted-foreground">
					{$LL.dashboard.figures.outstanding()}
				</span>
			</span>
			<span class="truncate text-xl leading-none font-semibold tabular-nums">
				<Cell.Money amount={outstanding} />
			</span>
		</a>
	</div>

	{#if workQueueQuery.isLoading}
		<div class="flex flex-1 items-center justify-center py-16" aria-busy="true">
			<Spinner class="size-6 text-muted-foreground" />
			<span class="sr-only">{$LL.common.ui.loading()}</span>
		</div>
	{:else if sections.length === 0}
		<Empty.Root class="rounded-2xl border border-dashed">
			<Empty.Header>
				<Empty.Title>{$LL.dashboard.empty.title()}</Empty.Title>
				<Empty.Description>{$LL.dashboard.empty.description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#each sections as section (section.summary.rank)}
			<DashboardSectionCard {section} />
		{/each}
	{/if}
</div>
