<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import { Badge } from '$lib/design/primitive/badge';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { isMoneyRank, type ContractRank } from '$lib/contract/rank';
	import { useFetchContractWorkQueue } from '$lib/dashboard/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleRangeWithUnit } from '$lib/platform/locale';

	type WorkQueue = Awaited<ReturnType<typeof api.contract.dashboard>>;
	type QueueEntry = WorkQueue['queue'][number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;
	const GROUP_HEADER_HEIGHT = 40;

	let search = $state('');

	const workQueueQuery = useFetchContractWorkQueue(() => search);
	const workQueue = $derived(workQueueQuery.data);
	const queue = $derived(workQueue?.queue ?? []);

	const rankLabels = $derived<Record<ContractRank, string>>({
		overdue: $LL.dashboard.queue.groups.overdue(),
		owing: $LL.dashboard.queue.groups.owing(),
		'ending-soon': $LL.dashboard.queue.groups.endingSoon()
	});

	const summaryOf = $derived(
		new Map((workQueue?.ranks ?? []).map((summary) => [summary.rank, summary]))
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

	const groupOf = (entry: QueueEntry) => ({ key: entry.rank });
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

	<List
		data={queue}
		bind:search
		{groupOf}
		isLoading={workQueueQuery.isLoading}
		isFetching={workQueueQuery.isFetching}
		recordHeight={ROW_HEIGHT}
		groupHeaderHeight={GROUP_HEADER_HEIGHT}
		emptyTitle={$LL.dashboard.empty.title()}
		emptyDescription={$LL.dashboard.empty.description()}
	>
		{#snippet groupHeader(group: { key: ContractRank })}
			{@const summary = summaryOf.get(group.key)}
			<div class="flex h-full items-center gap-2 border-b bg-background px-4">
				<span class="text-xs font-medium">{rankLabels[group.key]}</span>
				<span class="text-xs text-muted-foreground">
					{$LL.dashboard.queue.groupCount({ count: summary?.contractCount ?? 0 })}
				</span>
				<!-- only the money groups carry a total. a renewals contract owes nothing by
				definition, so the figure there would always read zero and say nothing. -->
				{#if isMoneyRank(group.key)}
					<span class="ms-auto text-xs text-muted-foreground">
						<Cell.Money amount={summary?.totalAmount ?? 0} />
					</span>
				{/if}
			</div>
		{/snippet}

		{#snippet record(entry: QueueEntry)}
			<div
				class="relative flex h-full items-center gap-3 border-b px-4 transition-colors hover:bg-muted/40"
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
	</List>
</div>
