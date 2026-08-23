<script lang="ts">
	import { resolve } from '$app/paths';
	import { isFilterPeriod, type FilterPeriod } from '$lib/api/period';
	import * as Cell from '$lib/design/cell';
	import { PERIOD_FILTER, toFilterOptions } from '$lib/design/filter';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as DropdownMenu from '$lib/design/primitive/dropdown-menu';
	import * as Empty from '@rentable/design/primitive/empty/index.js';
	import { toDashboardSections } from '$lib/dashboard/dashboard';
	import { useFetchContractWorkQueue } from '$lib/dashboard/query';
	import DashboardSectionCard from '$lib/dashboard/component/section.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleRangeWithUnit } from '$lib/platform/locale';
	import { Spinner } from '@rentable/design/primitive/spinner/index.js';
	import CheckIcon from '@tabler/icons-svelte/icons/check';
	import ChevronDownIcon from '@tabler/icons-svelte/icons/chevron-down';
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
	// the period the money figures answer about. It opens on the current month, which is what
	// this band could say and nothing else before it took one.
	let period = $state<FilterPeriod>('this-month');

	const workQueueQuery = useFetchContractWorkQueue(() => period);
	const workQueue = $derived(workQueueQuery.data);

	const money = $derived(workQueue?.summary.money);

	// the vocabulary a list offers, read through the same declaration rather than restated here.
	// The screen that has to agree with this one is a list, and a second table of periods beside
	// this one is how two surfaces come to mean different things by the same word.
	const periodOptions = $derived(toFilterOptions(PERIOD_FILTER));
	const periodLabel = $derived(
		periodOptions.find((option) => option.id === period)?.label($LL) ?? ''
	);
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

     The last card takes the frame's own bottom padding, which reaches it now that the frame grows
     with what it holds rather than standing exactly one viewport high. This column used to carry a
     second bottom space of its own because the frame's could not be seen. -->
<div class="flex flex-1 flex-col gap-4">
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
		<!-- the money card carries the control, because the period is what its two figures mean and
		     nothing else on the band answers about time. It sits outside the link rather than
		     inside it: a button within an anchor is not a thing a browser can be asked to render,
		     and pressing one would follow the link on the way past. -->
		<div class="flex flex-col gap-2 rounded-2xl bg-card p-4 sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="truncate text-xs text-muted-foreground">
					{$LL.dashboard.figures.collected()}
				</span>

				<!-- the chosen period is on the control, not behind it: every figure beside it is a
				     number without a span of time attached, and a band that does not say which span
				     is a band that can be read wrong without looking wrong. -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="sm" class="h-6 gap-1 px-2 text-xs">
								<span class="capitalize">{periodLabel}</span>
								<ChevronDownIcon class="size-3" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Label class="capitalize">
							{PERIOD_FILTER.label($LL)}
						</DropdownMenu.Label>
						<DropdownMenu.Separator />
						{#each periodOptions as option (option.id)}
							<DropdownMenu.Item
								onSelect={() => {
									if (isFilterPeriod(option.id)) {
										period = option.id;
									}
								}}
							>
								<span class="flex-1 capitalize">{option.label($LL)}</span>
								{#if option.id === period}
									<CheckIcon class="size-3.5" />
								{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			<a
				href={resolve('/contracts')}
				class="-m-1 flex items-center justify-around gap-4 rounded-xl p-1 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<Cell.Ring size="hero" value={money?.collected ?? 0} total={money?.due ?? 0} />
				<span class="flex min-w-0 flex-col gap-1 text-start">
					<span class="truncate text-sm font-semibold tabular-nums">
						<Cell.Money amount={money?.collected ?? 0} />
					</span>
					<span class="truncate text-xs text-muted-foreground tabular-nums">
						<Cell.Money amount={money?.due ?? 0} />
					</span>
				</span>
			</a>
		</div>

		<a
			href={resolve('/complexes')}
			class="flex items-center justify-around gap-4 rounded-2xl bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
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
			class="flex flex-col justify-center gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
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
