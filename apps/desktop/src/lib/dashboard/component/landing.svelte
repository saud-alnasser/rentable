<script lang="ts">
	import { resolve } from '$app/paths';
	import { isFilterPeriod, type FilterPeriod } from '$lib/date';
	import * as Cell from '$lib/design/cell';
	import { PERIOD_FILTER, toFilterOptions } from '$lib/list';
	import Loading from '@rentable/design/block/loading.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import Empty from '@rentable/design/block/empty.svelte';
	import { CONTRACT_KIND, isMoneyRank } from '$lib/contract';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ENDING_SOON_PARAM,
		toDashboardSections,
		type DashboardSection
	} from '$lib/dashboard/dashboard';
	import { useFetchContractWorkQueue } from '$lib/dashboard/query';
	import { toReadFailure } from '$lib/error/read';
	import { memberPermissions } from '$lib/permission';
	import DashboardEndingSoon from '$lib/dashboard/component/ending-soon.svelte';
	import DashboardSectionCard from '$lib/dashboard/component/section.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleRangeWithUnit } from '$lib/platform/locale';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CoinsIcon from '@lucide/svelte/icons/coins';

	/**
	 * The landing screen: a band of routed figures over one section of records per attention rank
	 * (ADR 0030).
	 *
	 * What may join it is a stated test: **a figure routes somewhere, or a section holds rows**.
	 * It is the load-bearing half of that decision. ADR 0014 deleted thirteen portfolio figures
	 * from this screen for going unread; anything added here that neither opens a page nor lists
	 * records is the beginning of that happening again.
	 *
	 * **A section may carry the control for the setting that defines it**, and the ending-soon
	 * section does: its header holds the window, and stands with no rows where nothing falls in it,
	 * so a window that catches nothing is widened where it would show (effort 846, requirements 6
	 * and 7).
	 *
	 * **A figure it does not know, it does not draw.** The band and the sections are one read, so
	 * they load under one loading block and fail as one: while the read is on its way both draw
	 * their shape, and a read that failed draws the failed state in place of both, never a band of
	 * zeros beside *nothing to chase* (effort 861, requirement 2). A figure the reader may not view
	 * is left out of the read (effort 838, requirement 10) and out of the band with it, never drawn
	 * as `0`: a card with nothing the reader may see is not drawn, and the money ring only where
	 * both what was due and what was collected are known. Nor is a door drawn to a page the reader
	 * may not open: the money card links to the contracts only for a reader who may view them.
	 */
	// the period the money figures answer about. It opens on the current month, which is what
	// this band could say and nothing else before it took one.
	let period = $state<FilterPeriod>('this-month');

	const workQueueQuery = useFetchContractWorkQueue(() => period);
	const workQueue = $derived(workQueueQuery.data);
	// whether the read failed with nothing to show, as `$lib/error/read` decides it, and what runs
	// it again: the failed state stands in place of the band and the sections while it did.
	const workQueueRead = $derived(toReadFailure(workQueueQuery));

	// whether the reader may view contracts. The read answers no ranks and no queue to a reader who
	// may not, and a list they were not allowed to read is not one with nothing in it: nothing is
	// drawn from it, neither the outstanding figure, a section, nor *nothing to chase*.
	const viewsContracts = $derived(memberPermissions.views(CONTRACT_KIND));

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

	// the ending-soon section's header stands whether or not a contract falls in the window, so the
	// window is always widened from where it shows (effort 846, requirement 7). Where none does, the
	// header is drawn in the rank's own place, last, saying so, with no rows.
	const holdsEndingSoon = $derived(
		sections.some((section) => section.summary.rank === 'ending-soon')
	);
	const vacantEndingSoon: DashboardSection<never> = {
		summary: { rank: 'ending-soon', contractCount: 0, totalAmount: 0 },
		entries: [],
		hiddenCount: 0
	};

	// whether the ending-soon control is showing. The command menu's place for the window opens it
	// through the address, which is cleared once read, so a reload or a step back does not open it
	// again.
	let endingSoonOpen = $state(false);

	$effect(() => {
		if (!page.url.searchParams.has(ENDING_SOON_PARAM)) {
			return;
		}

		endingSoonOpen = true;
		void goto(resolve('/'), { replaceState: true, noScroll: true, keepFocus: true });
	});

	// the debt across every rank that carries one, which is the money ranks: what falls due this
	// week is not owed yet, so it is not outstanding, whatever a rank beside them totals.
	const outstanding = $derived(
		viewsContracts
			? ranks
					.filter((summary) => isMoneyRank(summary.rank))
					.reduce((sum, summary) => sum + summary.totalAmount, 0)
			: undefined
	);

	// through the range formatter rather than a message with two placeholders: bare numbers are
	// Latin digits whatever the locale, and two of those either side of a slash are reordered by
	// Arabic into `total / occupied`: the same pair, stating the opposite. Nothing where the read
	// left the occupancy out, since a reader who may not view units is told nothing of them.
	const occupiedOfTotal = $derived(
		occupancy &&
			formatLocaleRangeWithUnit(
				$locale,
				occupancy.occupiedUnits,
				occupancy.totalUnits,
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
	<!-- the band and the sections are one read, so they load as one and fail as one: no figure
	     is drawn before the read has answered, and a read that failed is said in place of both,
	     never as a band of zeros over *nothing to chase* ([[rules/interface]], *Loading* and
	     *Empty*). -->
	<Loading
		loading={workQueueQuery.isPending}
		label={$LL.common.ui.loading()}
		class="flex flex-col gap-4"
	>
		<!-- the shape of the band over two sections: three figure cards, a ring beside two lines
		     on the first two and a glyph over a line on the last, then a header naming a rank over
		     a few rows of contracts. -->
		{#snippet skeleton()}
			<div
				class="-mx-5 -mt-5 grid gap-3 px-5 pt-5 pb-3 sm:grid-cols-2 shell:grid-cols-3"
				data-dashboard-band-skeleton
			>
				{#each { length: 2 }, index (index)}
					<div class="flex flex-col gap-2 rounded-2xl bg-card p-4 sm:p-5">
						<Skeleton class="h-6 w-24" />
						<div class="flex items-center justify-around gap-4 p-1">
							<Skeleton class="size-16 rounded-full sm:size-24" />
							<div class="flex flex-col gap-2">
								<Skeleton class="h-4 w-20" />
								<Skeleton class="h-3 w-16" />
							</div>
						</div>
					</div>
				{/each}
				<div class="flex flex-col justify-center gap-3 rounded-2xl bg-card p-4 sm:p-5">
					<div class="flex items-center gap-3">
						<Skeleton class="size-9 rounded-xl" />
						<Skeleton class="h-3 w-20" />
					</div>
					<Skeleton class="h-5 w-32" />
				</div>
			</div>
			{#each { length: 2 }, index (index)}
				<div class="flex flex-col gap-3 rounded-2xl bg-card p-4">
					<div class="flex items-center gap-3">
						<Skeleton class="size-8 rounded-lg" />
						<Skeleton class="h-4 w-32" />
					</div>
					{#each { length: 3 }, row (row)}
						<Skeleton class="h-10 w-full rounded-xl" />
					{/each}
				</div>
			{/each}
		{/snippet}

		{#if workQueueRead.failed}
			<!-- the read failed, so whether there is anything to chase is not known: the failed
			     state, with *try again*, stands where the band and the sections would. -->
			<Empty kind="failed" onRetry={workQueueRead.retry} class="rounded-2xl border border-dashed" />
		{:else if workQueue}
			{@const collected = workQueue.summary.money.collected}
			{@const due = workQueue.summary.money.due}
			{@const returned = workQueue.summary.money.returned}
			{@const holdsMoney = collected !== undefined || due !== undefined}

			<!-- every figure here is a door: the band states how the month is going, and each way
			     in lands on the page holding the detail behind it. It pins to the top of the
			     scrollport so the month stays readable while the sections are worked; the bleed and
			     the background are what stop rows showing through it once it is pinned.

			     It pins only where there is room to: stacked one to a line on a narrow window it is
			     most of a short screen, and a band pinned over the work it is meant to sit above is
			     worse than one that scrolls away.

			     A card with nothing the reader may see is not drawn, and a band with no card is not
			     drawn either. -->
			{#if holdsMoney || occupancy || outstanding !== undefined}
				<div
					class="-mx-5 -mt-5 grid gap-3 bg-background px-5 pt-5 pb-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 sm:sticky sm:top-0 sm:z-10 sm:grid-cols-2 shell:grid-cols-3"
				>
					<!-- the money card carries the control, because the period is what its two
					     figures mean and nothing else on the band answers about time. It sits
					     outside the link rather than inside it: a button within an anchor is not a
					     thing a browser can be asked to render, and pressing one would follow the
					     link on the way past. Where collected is left out, what was due heads the
					     card under its own name. -->
					{#if holdsMoney}
						<div class="flex flex-col gap-2 rounded-2xl bg-card p-4 sm:p-5">
							<div class="flex items-center justify-between gap-2">
								<span class="truncate text-xs text-muted-foreground">
									{collected === undefined
										? $LL.dashboard.figures.expected()
										: $LL.dashboard.figures.collected()}
								</span>

								<!-- the chosen period is on the control, not behind it: every
								     figure beside it is a number without a span of time attached,
								     and a band that does not say which span is a band that can be
								     read wrong without looking wrong. -->
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button {...props} variant="ghost" size="sm" class="h-6 gap-1 px-2 text-xs">
												<span class="capitalize">{periodLabel}</span>
												<ChevronDownIcon class="size-3.5" />
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

							<!-- a door only where the reader may go: a reader who may not view contracts is
							     shown the same figures with no link, since the page it opens is one they may
							     not open (ticket 16 of effort 861). -->
							{#if viewsContracts}
								<a
									href={resolve('/contracts')}
									class="-m-1 flex items-center justify-around gap-4 rounded-xl p-1 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									{@render moneyFigures()}
								</a>
							{:else}
								<div class="-m-1 flex items-center justify-around gap-4 p-1">
									{@render moneyFigures()}
								</div>
							{/if}

							{#snippet moneyFigures()}
								<!-- the ring is collected of due, so it is drawn only where both
								     are known. -->
								{#if collected !== undefined && due !== undefined}
									<Cell.Ring size="hero" value={collected} total={due} />
								{/if}
								<span class="flex min-w-0 flex-col gap-1 text-start">
									{#if collected !== undefined}
										<span class="truncate text-sm font-semibold tabular-nums">
											<Cell.Money amount={collected} />
										</span>
									{/if}
									{#if due !== undefined}
										<span
											class={collected === undefined
												? 'truncate text-sm font-semibold tabular-nums'
												: 'truncate text-xs text-muted-foreground tabular-nums'}
										>
											<Cell.Money amount={due} />
										</span>
									{/if}
									<!-- money paid back to tenants in the period, named because it
									     is a third amount under the ring and the only one the ring
									     does not draw. It is never taken off collected, so the two
									     read side by side, and it is not shown where nothing went
									     back (effort 854, requirement 28). -->
									{#if returned}
										<span class="truncate text-xs text-muted-foreground tabular-nums">
											{$LL.dashboard.figures.returned()}
											<Cell.Money amount={returned} />
										</span>
									{/if}
								</span>
							{/snippet}
						</div>
					{/if}

					{#if occupancy}
						<a
							href={resolve('/complexes')}
							class="flex flex-col gap-2 rounded-2xl bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
						>
							<!-- the label heads the card as the money card's does, on a row as tall
							     as its period control, so the two rings sit on one line across the
							     band. -->
							<span class="flex h-6 items-center truncate text-xs text-muted-foreground">
								{$LL.dashboard.figures.occupiedUnits()}
							</span>
							<span class="-m-1 flex items-center justify-around gap-4 p-1" data-occupancy-figure>
								<Cell.Ring
									size="hero"
									value={occupancy.occupiedUnits}
									total={occupancy.totalUnits}
								/>
								<span class="flex min-w-0 flex-col gap-1 text-start">
									<span class="truncate text-sm font-semibold tabular-nums">{occupiedOfTotal}</span>
								</span>
							</span>
						</a>
					{/if}

					{#if outstanding !== undefined}
						<a
							href={resolve('/contracts')}
							class="flex flex-col justify-center gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
						>
							<!-- outstanding is a total rather than a proportion, since there is
							     nothing it is a share of, so it is the one figure in the band that
							     is not a ring.

							     Its glyph shares a line with its name so the figure gets the card's
							     whole width: a portfolio's debt runs to seven digits and a unit,
							     which does not fit beside a glyph at three columns, and a headline
							     figure that ends in an ellipsis states nothing. -->
							<span class="flex items-center gap-3">
								<span
									class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
								>
									<CoinsIcon class="size-4" aria-hidden="true" />
								</span>
								<span class="truncate text-xs text-muted-foreground">
									{$LL.dashboard.figures.outstanding()}
								</span>
							</span>
							<span class="truncate text-xl leading-none font-semibold tabular-nums">
								<Cell.Money amount={outstanding} />
							</span>
						</a>
					{/if}
				</div>
			{/if}

			{#if !viewsContracts}
				<!-- nothing is drawn from a list the reader was not allowed to read: no section,
				     and not *nothing to chase*. -->
			{:else if sections.length === 0}
				<!-- the one empty treatment ([[rules/interface]], *Empty*). Nothing to chase is the
				     landing screen with nothing in it yet, and there is no act to offer: the
				     sections fill as contracts fall behind or near their end. It is said only here,
				     under a read that answered: a read on its way or one that failed does not know
				     whether there is anything to chase. -->
				<Empty
					kind="nothing-yet"
					title={$LL.dashboard.empty.title()}
					description={$LL.dashboard.empty.description()}
					class="rounded-2xl border border-dashed"
				/>
			{:else}
				{#each sections as section (section.summary.rank)}
					<DashboardSectionCard
						{section}
						control={section.summary.rank === 'ending-soon' ? endingSoonControl : undefined}
					/>
				{/each}
			{/if}

			{#if viewsContracts && !holdsEndingSoon}
				<DashboardSectionCard
					section={vacantEndingSoon}
					control={endingSoonControl}
					none={$LL.dashboard.endingSoon.none({ days: workQueue.endingSoonNoticeDays })}
				/>
			{/if}
		{/if}
	</Loading>
</div>

<!-- the control for the window that defines the ending-soon rank, at the end of that
     section's header and nowhere else on the screen. -->
{#snippet endingSoonControl()}
	{#if workQueue}
		<DashboardEndingSoon days={workQueue.endingSoonNoticeDays} bind:open={endingSoonOpen} />
	{/if}
{/snippet}
