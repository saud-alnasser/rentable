<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import { Badge } from '$lib/design/primitive/badge';
	import * as Empty from '$lib/design/primitive/empty';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Cell from '$lib/design/cell';
	import { isMoneyRank, type ContractRank } from '$lib/contract/rank';
	import { useFetchContractWorkQueue } from '$lib/dashboard/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleRangeWithUnit } from '$lib/platform/locale';

	type WorkQueue = Awaited<ReturnType<typeof api.contract.dashboard>>;
	type QueueEntry = WorkQueue['queue'][number];

	const workQueueQuery = useFetchContractWorkQueue();
	const workQueue = $derived(workQueueQuery.data);
	const queue = $derived(workQueue?.queue ?? []);

	const rankLabels = $derived<Record<ContractRank, string>>({
		overdue: $LL.dashboard.queue.groups.overdue(),
		owing: $LL.dashboard.queue.groups.owing(),
		'ending-soon': $LL.dashboard.queue.groups.endingSoon()
	});

	// the read returns a few contracts of each rank beside a summary describing the whole rank,
	// so the groups are built from the summaries: a rank's heading states what the rank holds,
	// and the rows under it are the few that came back.
	const groups = $derived(
		(workQueue?.ranks ?? []).map((summary) => ({
			summary,
			entries: queue.filter((entry) => entry.rank === summary.rank)
		}))
	);

	const collectedThisMonth = $derived(
		formatLocaleRangeWithUnit(
			$locale,
			workQueue?.summary.money.collectedThisMonth ?? 0,
			workQueue?.summary.money.dueThisMonth ?? 0,
			$LL.common.messages.sar()
		)
	);

	const occupiedUnits = $derived(
		$LL.dashboard.queue.occupancy({
			occupied: workQueue?.summary.occupancy.occupiedUnits ?? 0,
			total: workQueue?.summary.occupancy.totalUnits ?? 0
		})
	);
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<!-- the strip settles in as the first result set arrives — a trigger, not a loop. keyed
	so a later result set does not replay it, and gated because a keyframe animation on an
	element carrying no `data-state` is the surface's own to gate. -->
	{#key workQueueQuery.isSuccess}
		<div
			class="grid shrink-0 gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 sm:grid-cols-2"
		>
			<div class="rounded-2xl border bg-card px-4 py-3">
				<p class="text-xs text-muted-foreground">{$LL.dashboard.queue.collectedThisMonth()}</p>
				<p class="truncate text-lg font-semibold tabular-nums">{collectedThisMonth}</p>
			</div>
			<div class="rounded-2xl border bg-card px-4 py-3">
				<p class="text-xs text-muted-foreground">{$LL.dashboard.queue.occupiedUnits()}</p>
				<p class="truncate text-lg font-semibold tabular-nums">{occupiedUnits}</p>
			</div>
		</div>
	{/key}

	<!-- the queue is bounded by the read rather than virtualized: a few rows per rank is the
	whole response, so the rows are laid out directly and the scroller stays the frame's. -->
	<div class="app-scroll min-h-0 flex-1 overflow-y-auto rounded-3xl border bg-background">
		{#if workQueueQuery.isLoading}
			<div class="flex h-full items-center justify-center" aria-busy="true">
				<Spinner class="size-6 text-muted-foreground" />
				<span class="sr-only">{$LL.common.ui.loading()}</span>
			</div>
		{:else if groups.length === 0}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Title>{$LL.dashboard.empty.title()}</Empty.Title>
					<Empty.Description>{$LL.dashboard.empty.description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			{#each groups as group (group.summary.rank)}
				<div class="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2.5">
					<span class="text-xs font-medium">{rankLabels[group.summary.rank]}</span>
					<span class="text-xs text-muted-foreground">
						{$LL.dashboard.queue.groupCount({ count: group.summary.contractCount })}
					</span>
					<!-- only the money groups carry a total. a renewals contract owes nothing by
					definition, so the figure there would always read zero and say nothing. -->
					{#if isMoneyRank(group.summary.rank)}
						<span class="ms-auto text-xs text-muted-foreground">
							<Cell.Money amount={group.summary.totalAmount} />
						</span>
					{/if}
				</div>

				{#each group.entries as entry (entry.id)}
					{@render record(entry)}
				{/each}
			{/each}
		{/if}
	</div>
</div>

{#snippet record(entry: QueueEntry)}
	<div
		class="relative flex h-16 items-center gap-3 border-b px-4 transition-colors hover:bg-muted/40"
	>
		<!-- the link covers the row rather than wrapping it, so the phone can sit above it
		and stay selectable instead of being swallowed by the row's click target. -->
		<a
			href={resolve(`/contracts/${entry.id}`)}
			class="absolute inset-0 rounded-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			aria-label={$LL.dashboard.queue.openContract({ tenant: entry.tenantName })}
		></a>

		<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1">
			<span class="flex min-w-0 items-center gap-2">
				<span class="truncate text-sm font-medium">{entry.tenantName}</span>
				<Cell.Status status={entry.status} />
				{#if entry.isEndingSoon && isMoneyRank(entry.rank)}
					<Badge variant="outline">{$LL.dashboard.queue.alsoEnding()}</Badge>
				{/if}
			</span>
			<span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
				<Cell.Date value={entry.contractEnd} />
				<span aria-hidden="true">&middot;</span>
				<span class="pointer-events-auto truncate select-text">
					<Cell.Phone phone={entry.tenantPhone} />
				</span>
			</span>
		</span>

		<!-- a renewals contract owes nothing by construction, so the amount position is
		empty rather than reading zero — the same reason its group heading carries no
		total. The row's work is the end date beside it. -->
		{#if isMoneyRank(entry.rank)}
			<span class="pointer-events-none relative shrink-0 text-sm font-medium">
				<Cell.Money amount={entry.outstandingAmount} />
			</span>
		{/if}
	</div>
{/snippet}
