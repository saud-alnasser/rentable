<script lang="ts" module>
	import type { ContractRank } from '$lib/contract/rank';
	import AlertTriangleIcon from '@tabler/icons-svelte/icons/alert-triangle';
	import CalendarClockIcon from '@tabler/icons-svelte/icons/calendar-clock';
	import ClockPlayIcon from '@tabler/icons-svelte/icons/clock-play';

	/**
	 * The glyph each rank is read by: what is already late, what is behind, what needs renewing.
	 *
	 * They stand beside the rank's own word rather than instead of it, so they are read as
	 * severity rather than as vocabulary — an alert, a clock still running, and a calendar.
	 */
	const glyphs: Record<ContractRank, typeof AlertTriangleIcon> = {
		overdue: AlertTriangleIcon,
		owing: ClockPlayIcon,
		'ending-soon': CalendarClockIcon
	};
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	import { Badge } from '$lib/design/primitive/badge';
	import { Button } from '$lib/design/primitive/button';
	import ContractForm from '$lib/contract/component/form.svelte';
	import { isMoneyRank } from '$lib/contract/rank';
	import { withContractRank } from '$lib/contract/rank-filter';
	import type { DashboardSection } from '$lib/dashboard/dashboard';
	import { LL } from '$lib/i18n/i18n-svelte';

	type QueueEntry = Awaited<ReturnType<typeof api.contract.dashboard>>['queue'][number];

	/**
	 * One rank of contracts, as a card: what the rank is, how many it holds, what they owe, a few
	 * of them, and a way through to the rest.
	 *
	 * The heading's figures describe the whole rank while the rows are only the few the read
	 * returned, which is what lets the card state a count it is not showing.
	 */
	let { section }: { section: DashboardSection<QueueEntry> } = $props();

	const rank = $derived(section.summary.rank);
	const Icon = $derived(glyphs[rank]);

	const rankLabels = $derived<Record<ContractRank, string>>({
		overdue: $LL.contracts.ranks.overdue(),
		owing: $LL.contracts.ranks.owing(),
		'ending-soon': $LL.contracts.ranks.endingSoon()
	});

	/**
	 * Whether this rank is the renewals one, and so offers the action that answers it.
	 *
	 * The other two ranks are about money and renewing one settles nothing, which is the same
	 * split {@link isMoneyRank} already names — a rank's rows offer what its rank is for.
	 */
	const offersRenewal = $derived(!isMoneyRank(rank));

	// the contract the renewal form was opened on. A queue row carries an identity and the
	// figures the row shows; the form reads everything a renewal needs off the contract itself.
	let renewingContractId = $state<string | undefined>(undefined);
	let isRenewalFormOpen = $state(false);
	let renewalFormRenderKey = $state(0);

	const openRenewal = (id: string) => {
		renewingContractId = id;
		renewalFormRenderKey += 1;
		isRenewalFormOpen = true;
	};
</script>

<section class="shrink-0 rounded-2xl bg-card">
	<header class="flex items-center gap-3 border-b px-4 py-3">
		<!-- only the late rank is coloured. Two of three ranks marked as trouble is a screen with
		     no emphasis left to spend, and overdue is the one that is already costing money. -->
		<span
			class="flex size-8 shrink-0 items-center justify-center rounded-lg {rank === 'overdue'
				? 'bg-destructive/10 text-destructive'
				: 'bg-muted text-muted-foreground'}"
		>
			<Icon class="size-4" aria-hidden="true" />
		</span>

		<h2 class="text-sm font-medium">{rankLabels[rank]}</h2>
		<span class="text-xs text-muted-foreground tabular-nums">
			{$LL.dashboard.sections.contractCount({ count: section.summary.contractCount })}
		</span>

		<!-- only the money ranks carry a total. a renewals contract owes nothing by definition,
		     so the figure there would always read zero and say nothing. -->
		{#if isMoneyRank(rank)}
			<span class="ms-auto text-sm font-medium tabular-nums">
				<Cell.Money amount={section.summary.totalAmount} />
			</span>
		{/if}
	</header>

	<div class="flex flex-col p-2">
		{#each section.entries as entry (entry.id)}
			<div class="relative flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
				<!-- the link covers the row rather than wrapping it, so the phone can sit above it
				     and stay selectable instead of being swallowed by the row's click target. -->
				<a
					href={resolve(`/contracts/${entry.id}`)}
					class="absolute inset-0 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					aria-label={$LL.dashboard.sections.openContract({ tenant: entry.tenantName })}
				></a>

				<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1">
					<span class="flex min-w-0 items-center gap-2">
						<span class="truncate text-sm font-medium">{entry.tenantName}</span>
						<Cell.Status status={entry.status} />
						{#if entry.isEndingSoon && isMoneyRank(entry.rank)}
							<Badge variant="outline">{$LL.dashboard.sections.alsoEnding()}</Badge>
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

				<!-- a renewals contract owes nothing by construction, so the amount position is empty
				     rather than reading zero — the same reason its heading carries no total. -->
				{#if isMoneyRank(entry.rank)}
					<span class="pointer-events-none relative shrink-0 text-sm font-medium tabular-nums">
						<Cell.Money amount={entry.outstandingAmount} />
					</span>
				{/if}

				<!-- the row's own control, sitting above the link that covers the row: a row opens
				     its record and never does a second thing, so acting on one is always an
				     explicit control on it. -->
				{#if offersRenewal}
					<Button
						variant="outline"
						size="sm"
						class="relative shrink-0"
						aria-label={$LL.dashboard.sections.renewContract({ tenant: entry.tenantName })}
						onclick={() => openRenewal(entry.id)}
					>
						{$LL.common.actions.renew()}
					</Button>
				{/if}
			</div>
		{/each}
	</div>

	<!-- the door exists exactly when there is a rest to reach, and it states the whole rank
	     rather than the remainder: the list it opens is filtered to this rank, so the figure on
	     the door is what lands behind it. -->
	{#if section.hiddenCount > 0}
		<a
			href={resolve(withContractRank('/contracts', rank))}
			class="flex items-center justify-center gap-1 rounded-b-2xl border-t px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{$LL.dashboard.sections.seeAll({ count: section.summary.contractCount })}
		</a>
	{/if}
</section>

<!-- one form for the whole section, because a row's control acts on the one contract the reader
     reached for. Mounted only under the rank that offers renewal. -->
{#if offersRenewal}
	{#key renewalFormRenderKey}
		<ContractForm
			open={isRenewalFormOpen}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					renewalFormRenderKey += 1;
				}

				isRenewalFormOpen = isOpen;
			}}
			renewsContractId={renewingContractId}
		/>
	{/key}
{/if}
