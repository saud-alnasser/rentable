<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/api/database/schema';
	import api from '$lib/api/mod';
	import { getCollectionProgress } from '$lib/api/utils/dashboard';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import { Progress } from '$lib/common/components/fragments/progress';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import {
		formatLocaleDate,
		formatLocaleNumber,
		formatLocaleRangeWithUnit,
		formatLocaleValueWithUnit
	} from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import WalletIcon from '@lucide/svelte/icons/wallet';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;
	type FollowUpItem = DashboardData['followUps'][number];

	let { item }: { item: FollowUpItem } = $props();

	const statusVariants: Record<
		Contract['status'],
		'default' | 'secondary' | 'destructive' | 'outline'
	> = {
		scheduled: 'secondary',
		active: 'default',
		fulfilled: 'default',
		expired: 'outline',
		defaulted: 'destructive',
		terminated: 'outline'
	};

	const dashboardInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 shadow-sm backdrop-blur-md';
	const dashboardSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';
	const followUpAmountLabel = $LL.common.labels.dueBalance();
	const followUpRemainingLabel = $LL.common.labels.remainingDueBalance();
	const followUpProgressLabel = $LL.common.labels.dueBalanceCoveredToDate();

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });
	const formatCurrency = (value: number) => formatLocaleNumber($locale, value);
	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
	const formatMoneyRange = (start: number, end: number) =>
		formatLocaleRangeWithUnit($locale, start, end, $LL.common.messages.sar());

	let progress = $derived(
		getCollectionProgress(item.paidAmount + item.outstandingAmount, item.paidAmount)
	);
	let totalBalance = $derived(item.paidAmount + item.outstandingAmount);
	let hasActiveOverdueFollowUp = $derived(
		item.status === 'active' && item.outstandingAmount > item.dueNowAmount
	);
	let progressSummary = $derived(
		$LL.dashboard.followUps.progressSummary({ percent: Math.round(progress.rate) })
	);
</script>

<div class={cn(dashboardInsetPanelClass, 'bg-background/75')}>
	<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="space-y-4">
			<div class="flex flex-row justify-between gap-3 rtl:flex-row-reverse">
				<div class="flex flex-wrap items-center gap-2">
					<p class="text-base font-medium">{item.tenantName}</p>
					<Badge variant={statusVariants[item.status]}>{$LL.common.status[item.status]()}</Badge>
					{#if hasActiveOverdueFollowUp}
						<Badge variant="destructive">{$LL.common.status.overdue()}</Badge>
					{/if}
				</div>

				<div class="flex items-start justify-between gap-3">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									href={resolve(`/contracts/payments/${item.contractId}`)}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.common.actions.openPayments()}
									class="rounded-full border-border/60 bg-background/85 shadow-sm backdrop-blur-sm"
								>
									<WalletIcon class="size-4" />
									<span class="sr-only">{$LL.common.actions.openPayments()}</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8}
							>{$LL.common.actions.openPayments()}</Tooltip.Content
						>
					</Tooltip.Root>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
				<div class={dashboardSubtlePanelClass}>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.phone()}
					</p>
					<p
						class="mt-1 text-sm font-medium text-foreground"
						dir={localesMetadata[$locale].direction}
					>
						{item.tenantPhone}
					</p>
				</div>
				<div class={dashboardSubtlePanelClass}>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.contractEnds()}
					</p>
					<p class="mt-1 text-sm font-medium text-foreground">{formatDate(item.contractEnd)}</p>
				</div>
			</div>
		</div>

		<div class={dashboardInsetPanelClass}>
			<div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 [&>*]:text-start">
				<div class={dashboardSubtlePanelClass}>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">{followUpAmountLabel}</p>
					<p class="mt-1 text-sm font-semibold text-foreground">{formatMoney(totalBalance)}</p>
				</div>
				<div class={dashboardSubtlePanelClass}>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{followUpRemainingLabel}
					</p>
					<p class="mt-1 text-sm font-semibold text-foreground">
						{formatMoney(progress.remainingAmount)}
					</p>
				</div>
			</div>

			<div class={cn('mt-4', dashboardSubtlePanelClass)}>
				<div class="flex items-center justify-between gap-3 text-sm rtl:flex-row-reverse">
					<span class="font-medium">{followUpProgressLabel}</span>
					<span class="text-muted-foreground">
						{formatMoneyRange(
							progress.coveredAmount,
							progress.coveredAmount + progress.remainingAmount
						)}
					</span>
				</div>

				<Progress
					value={progress.coveredAmount}
					max={Math.max(progress.coveredAmount + progress.remainingAmount, 1)}
					class="mt-2 h-3 bg-emerald-500/15 **:data-[slot=progress-indicator]:bg-emerald-600"
				/>

				<div
					class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground rtl:flex-row-reverse"
				>
					<span>{progressSummary}</span>
					<span
						>{$LL.dashboard.followUps.remaining({
							amount: formatCurrency(progress.remainingAmount)
						})}</span
					>
				</div>
			</div>
		</div>
	</div>
</div>
