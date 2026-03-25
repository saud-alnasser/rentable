<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/api/database/schema';
	import api from '$lib/api/mod';
	import { getCollectionProgress } from '$lib/api/utils/dashboard';
	import { Badge } from '$lib/common/components/fragments/badge';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Progress } from '$lib/common/components/fragments/progress';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useFetchContractDashboard } from '$lib/resources/contracts/hooks/queries';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
	const formatDate = (value: number) =>
		new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(value)
		);
	const formatDateTime = (value: number) =>
		new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC'
		}).format(new Date(value));

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

	const intervalLabels: Record<
		Contract['interval'],
		'monthly' | 'quarterly' | 'semiAnnual' | 'annual'
	> = {
		'1m': 'monthly',
		'3m': 'quarterly',
		'6m': 'semiAnnual',
		'12m': 'annual'
	};

	const getFollowUpProgress = (item: DashboardData['followUps'][number]) => {
		return getCollectionProgress(item.paidAmount + item.outstandingAmount, item.paidAmount);
	};

	const getFollowUpTotalBalance = (item: DashboardData['followUps'][number]) =>
		item.paidAmount + item.outstandingAmount;

	const hasActiveOverdueFollowUp = (item: DashboardData['followUps'][number]) =>
		item.status === 'active' && item.outstandingAmount > item.dueNowAmount;

	const followUpAmountLabel = $LL.common.labels.dueBalance();
	const followUpRemainingLabel = $LL.common.labels.remainingDueBalance();
	const followUpProgressLabel = $LL.common.labels.dueBalanceCoveredToDate();

	const getFollowUpProgressSummary = (rate: number) =>
		$LL.dashboard.followUps.progressSummary({ percent: Math.round(rate) });
	const formatNoticeWindow = (days: number) =>
		days === 1 ? $LL.common.time.day({ count: days }) : $LL.common.time.days({ count: days });

	type SummaryStat = {
		label: string;
		value: string;
	};

	type SummarySection = {
		title: string;
		description: string;
		heroLabel: string;
		heroValue: string;
		heroHint: string;
		heroClass: string;
		stats: SummaryStat[];
	};

	const dashboardQuery = useFetchContractDashboard();

	const getSummarySections = (data: DashboardData): SummarySection[] => [
		{
			title: $LL.dashboard.sections.contracts.title(),
			description: $LL.dashboard.sections.contracts.description({
				noticeWindow: formatNoticeWindow(data.endingSoonNoticeDays)
			}),
			heroLabel: $LL.dashboard.sections.contracts.heroLabel(),
			heroValue: String(data.summary.contracts.total),
			heroHint: $LL.dashboard.sections.contracts.heroHint({
				active: data.summary.contracts.active,
				endingSoon: data.summary.contracts.endingSoon,
				noticeWindow: formatNoticeWindow(data.endingSoonNoticeDays)
			}),
			heroClass: 'border-sky-500/20 bg-sky-500/10',
			stats: [
				{
					label: $LL.common.status.active(),
					value: $LL.dashboard.stats.activeEndingWithin({
						active: data.summary.contracts.active,
						endingSoon: data.summary.contracts.endingSoon,
						noticeWindow: formatNoticeWindow(data.endingSoonNoticeDays)
					})
				},
				{ label: $LL.common.status.scheduled(), value: String(data.summary.contracts.scheduled) },
				{ label: $LL.common.status.fulfilled(), value: String(data.summary.contracts.fulfilled) },
				{ label: $LL.common.status.expired(), value: String(data.summary.contracts.expired) },
				{ label: $LL.common.status.defaulted(), value: String(data.summary.contracts.defaulted) },
				{ label: $LL.common.status.terminated(), value: String(data.summary.contracts.terminated) }
			]
		},
		{
			title: $LL.dashboard.sections.money.title(),
			description: $LL.dashboard.sections.money.description({ monthLabel: data.monthLabel }),
			heroLabel: $LL.dashboard.sections.money.heroLabel(),
			heroValue: `${formatCurrency(data.summary.money.outstandingNow)} ${$LL.common.messages.sar()}`,
			heroHint: $LL.dashboard.sections.money.heroHint({
				rate: data.summary.money.monthlyCollectionRate,
				monthLabel: data.monthLabel
			}),
			heroClass: 'border-emerald-500/20 bg-emerald-500/10',
			stats: [
				{
					label: $LL.dashboard.stats.dueThisMonth(),
					value: `${formatCurrency(data.summary.money.dueThisMonth)} ${$LL.common.messages.sar()}`
				},
				{
					label: $LL.dashboard.stats.receivedThisMonth(),
					value: `${formatCurrency(data.summary.money.collectedThisMonth)} ${$LL.common.messages.sar()}`
				},
				{
					label: $LL.dashboard.stats.stillDueThisMonth(),
					value: `${formatCurrency(data.summary.money.remainingThisMonth)} ${$LL.common.messages.sar()}`
				},
				{
					label: $LL.dashboard.stats.overallCollectionRate(),
					value: `${data.summary.money.overallCollectionRate}%`
				},
				{
					label: $LL.dashboard.stats.totalExpectedAmount(),
					value: `${formatCurrency(data.summary.money.totalExpectedAmount)} ${$LL.common.messages.sar()}`
				}
			]
		},
		{
			title: $LL.dashboard.sections.occupancy.title(),
			description: $LL.dashboard.sections.occupancy.description(),
			heroLabel: $LL.dashboard.sections.occupancy.heroLabel(),
			heroValue: `${data.summary.occupancy.occupancyRate}%`,
			heroHint: $LL.dashboard.sections.occupancy.heroHint({
				occupied: data.summary.occupancy.occupiedUnits,
				total: data.summary.occupancy.totalUnits
			}),
			heroClass: 'border-violet-500/20 bg-violet-500/10',
			stats: [
				{
					label: $LL.dashboard.stats.totalUnits(),
					value: String(data.summary.occupancy.totalUnits)
				},
				{
					label: $LL.dashboard.stats.occupiedUnits(),
					value: String(data.summary.occupancy.occupiedUnits)
				},
				{
					label: $LL.dashboard.stats.vacantUnits(),
					value: String(data.summary.occupancy.vacantUnits)
				},
				{
					label: $LL.dashboard.stats.vacancyRate(),
					value: `${data.summary.occupancy.vacancyRate}%`
				}
			]
		}
	];
</script>

{#if dashboardQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-1">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingDashboard()}</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-5 p-1">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-semibold tracking-tight">{$LL.dashboard.title()}</h1>
			<p class="text-sm text-muted-foreground">
				{$LL.dashboard.description()}
			</p>
			{#if dashboardQuery.data}
				<p class="text-xs text-muted-foreground">
					{$LL.dashboard.lastSynchronized({
						value: formatDateTime(dashboardQuery.data.generatedAt)
					})}
				</p>
			{/if}
		</div>

		{#if dashboardQuery.data}
			<div class="grid gap-4 xl:grid-cols-3">
				{#each getSummarySections(dashboardQuery.data) as section (`${section.title}-${section.heroLabel}-${section.heroValue}`)}
					<Card class="gap-4 overflow-hidden">
						<CardHeader class="gap-3">
							<CardTitle class="capitalize">{section.title}</CardTitle>
							<CardDescription>{section.description}</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class={`rounded-xl border p-4 ${section.heroClass}`}>
								<p class="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
									{section.heroLabel}
								</p>
								<div class="mt-3 flex flex-wrap items-end justify-between gap-3">
									<p class="text-3xl font-semibold tracking-tight">{section.heroValue}</p>
									<p class="max-w-[16rem] text-sm text-muted-foreground">
										{section.heroHint}
									</p>
								</div>
							</div>

							<div class="grid gap-3 sm:grid-cols-2">
								{#each section.stats as stat (`${stat.label}-${stat.value}`)}
									<div class="rounded-lg border bg-muted/15 p-3">
										<p class="text-xs tracking-wide text-muted-foreground uppercase">
											{stat.label}
										</p>
										<p class="mt-1 text-base font-semibold">{stat.value}</p>
									</div>
								{/each}
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>

			<Card class="gap-4 overflow-hidden">
				<CardHeader class="gap-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="space-y-1">
							<CardTitle
								>{$LL.dashboard.followUps.title({
									monthLabel: dashboardQuery.data.monthLabel
								})}</CardTitle
							>
							<CardDescription>
								{$LL.dashboard.followUps.description()}
							</CardDescription>
						</div>
						<div
							class="rounded-full border bg-muted/15 px-3 py-1 text-xs font-medium text-muted-foreground"
						>
							{dashboardQuery.data.followUps.length === 1
								? $LL.dashboard.followUps.countOne({ count: 1 })
								: $LL.dashboard.followUps.countOther({
										count: dashboardQuery.data.followUps.length
									})}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{#if dashboardQuery.data.followUps.length === 0}
						<p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							{$LL.dashboard.followUps.empty()}
						</p>
					{:else}
						<div class="space-y-4">
							{#each dashboardQuery.data.followUps as item (item.contractId)}
								{@const progress = getFollowUpProgress(item)}
								<div class="rounded-xl border bg-muted/10 p-4">
									<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
										<div class="space-y-4">
											<div class="flex flex-row justify-between gap-3">
												<div class="flex flex-wrap items-center gap-2">
													<p class="text-base font-medium">{item.tenantName}</p>
													<Badge variant={statusVariants[item.status]}>
														{$LL.common.status[item.status]()}
													</Badge>
													{#if hasActiveOverdueFollowUp(item)}
														<Badge variant="destructive">{$LL.common.status.overdue()}</Badge>
													{/if}
													{#if item.govId}
														<Badge variant="outline">{item.govId}</Badge>
													{/if}
												</div>

												<div class="flex items-start justify-between gap-3">
													<a
														href={resolve(`/contracts/payments/${item.contractId}`)}
														class="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
													>
														{$LL.common.actions.openPayments()}
													</a>
												</div>
											</div>

											<div class="grid gap-3 sm:grid-cols-3">
												<div class="rounded-lg border bg-background/70 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{$LL.common.labels.phone()}
													</p>
													<p class="mt-1 text-sm font-medium text-foreground">{item.tenantPhone}</p>
												</div>
												<div class="rounded-lg border bg-background/70 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{$LL.common.labels.cycle()}
													</p>
													<p class="mt-1 text-sm font-medium text-foreground capitalize">
														{$LL.contracts.intervals[intervalLabels[item.interval]]()}
													</p>
												</div>
												<div class="rounded-lg border bg-background/70 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{$LL.common.labels.contractEnds()}
													</p>
													<p class="mt-1 text-sm font-medium text-foreground">
														{formatDate(item.contractEnd)}
													</p>
												</div>
											</div>
										</div>

										<div class="rounded-xl border bg-background/70 p-4">
											<div class="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
												<div class="rounded-lg border bg-muted/15 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{followUpAmountLabel}
													</p>
													<p class="mt-1 text-sm font-semibold text-foreground">
														{formatCurrency(getFollowUpTotalBalance(item))}
														{$LL.common.messages.sar()}
													</p>
												</div>
												<div class="rounded-lg border bg-muted/15 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{$LL.dashboard.stats.receivedThisMonth()}
													</p>
													<p class="mt-1 text-sm font-semibold text-foreground">
														{formatCurrency(item.collectedThisMonth)}
														{$LL.common.messages.sar()}
													</p>
												</div>
												<div class="rounded-lg border bg-muted/15 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{followUpRemainingLabel}
													</p>
													<p class="mt-1 text-sm font-semibold text-foreground">
														{formatCurrency(progress.remainingAmount)}
														{$LL.common.messages.sar()}
													</p>
												</div>
											</div>

											<div class="mt-4 rounded-lg border bg-muted/15 p-3">
												<div class="flex items-center justify-between gap-3 text-sm">
													<span class="font-medium">{followUpProgressLabel}</span>
													<span class="text-muted-foreground">
														{formatCurrency(progress.coveredAmount)} / {formatCurrency(
															progress.coveredAmount + progress.remainingAmount
														)}
														{$LL.common.messages.sar()}
													</span>
												</div>

												<Progress
													value={progress.coveredAmount}
													max={Math.max(progress.coveredAmount + progress.remainingAmount, 1)}
													class="mt-2 h-3 bg-emerald-500/15 **:data-[slot=progress-indicator]:bg-emerald-600"
												/>

												<div
													class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"
												>
													<span>{getFollowUpProgressSummary(progress.rate)}</span>
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
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardContent class="pt-6">
					<p class="text-sm text-muted-foreground">{$LL.dashboard.followUps.unavailable()}</p>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
