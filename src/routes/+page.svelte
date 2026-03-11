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

	const intervalLabels: Record<Contract['interval'], string> = {
		'1m': 'monthly',
		'3m': 'quarterly',
		'6m': 'semi-annual',
		'12m': 'annual'
	};

	const getFollowUpProgress = (item: DashboardData['followUps'][number]) => {
		return getCollectionProgress(item.paidAmount + item.outstandingAmount, item.paidAmount);
	};

	const getFollowUpTotalBalance = (item: DashboardData['followUps'][number]) =>
		item.paidAmount + item.outstandingAmount;

	const hasActiveOverdueFollowUp = (item: DashboardData['followUps'][number]) =>
		item.status === 'active' && item.outstandingAmount > item.dueNowAmount;

	const followUpAmountLabel = 'due balance';
	const followUpRemainingLabel = 'remaining due balance';
	const followUpProgressLabel = 'due balance covered to date';

	const getFollowUpProgressSummary = (rate: number) =>
		`${Math.round(rate)}% of the due balance covered to date`;
	const formatNoticeWindow = (days: number) => `${days} day${days === 1 ? '' : 's'}`;

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
			title: 'contracts',
			description: `status health across the current portfolio, with ending soon based on the configured ${formatNoticeWindow(data.endingSoonNoticeDays)} notice window.`,
			heroLabel: 'current portfolio size',
			heroValue: String(data.summary.contracts.total),
			heroHint: `${data.summary.contracts.active} active • ${data.summary.contracts.endingSoon} ending within ${formatNoticeWindow(data.endingSoonNoticeDays)}`,
			heroClass: 'border-sky-500/20 bg-sky-500/10',
			stats: [
				{
					label: 'active',
					value: `${data.summary.contracts.active} • ${data.summary.contracts.endingSoon} ending within ${formatNoticeWindow(data.endingSoonNoticeDays)}`
				},
				{ label: 'scheduled', value: String(data.summary.contracts.scheduled) },
				{ label: 'fulfilled', value: String(data.summary.contracts.fulfilled) },
				{ label: 'expired', value: String(data.summary.contracts.expired) },
				{ label: 'defaulted', value: String(data.summary.contracts.defaulted) },
				{ label: 'terminated', value: String(data.summary.contracts.terminated) }
			]
		},
		{
			title: 'money',
			description: `scheduled dues for ${data.monthLabel}, payments received this month, and overall contract balances.`,
			heroLabel: 'outstanding now',
			heroValue: `${formatCurrency(data.summary.money.outstandingNow)} SAR`,
			heroHint: `${data.summary.money.monthlyCollectionRate}% of the due for ${data.monthLabel} is covered`,
			heroClass: 'border-emerald-500/20 bg-emerald-500/10',
			stats: [
				{
					label: 'due this month',
					value: `${formatCurrency(data.summary.money.dueThisMonth)} SAR`
				},
				{
					label: 'received this month',
					value: `${formatCurrency(data.summary.money.collectedThisMonth)} SAR`
				},
				{
					label: 'still due this month',
					value: `${formatCurrency(data.summary.money.remainingThisMonth)} SAR`
				},
				{
					label: 'overall collection rate',
					value: `${data.summary.money.overallCollectionRate}%`
				},
				{
					label: 'total expected amount',
					value: `${formatCurrency(data.summary.money.totalExpectedAmount)} SAR`
				}
			]
		},
		{
			title: 'occupancy',
			description: 'stored unit statuses after dashboard synchronization.',
			heroLabel: 'occupancy rate',
			heroValue: `${data.summary.occupancy.occupancyRate}%`,
			heroHint: `${data.summary.occupancy.occupiedUnits} occupied out of ${data.summary.occupancy.totalUnits} units`,
			heroClass: 'border-violet-500/20 bg-violet-500/10',
			stats: [
				{ label: 'total units', value: String(data.summary.occupancy.totalUnits) },
				{ label: 'occupied units', value: String(data.summary.occupancy.occupiedUnits) },
				{ label: 'vacant units', value: String(data.summary.occupancy.vacantUnits) },
				{
					label: 'vacancy rate',
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
			<p class="text-sm text-muted-foreground">loading dashboard...</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-5 p-1">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-semibold tracking-tight">Dashboard</h1>
			<p class="text-sm text-muted-foreground">
				track contract health, payment performance, and occupancy after status synchronization.
			</p>
			{#if dashboardQuery.data}
				<p class="text-xs text-muted-foreground">
					last synchronized {formatDateTime(dashboardQuery.data.generatedAt)}
				</p>
			{/if}
		</div>

		{#if dashboardQuery.data}
			<div class="grid gap-4 xl:grid-cols-3">
				{#each getSummarySections(dashboardQuery.data) as section (section.title)}
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
								{#each section.stats as stat (stat.label)}
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
							<CardTitle>payments requiring follow-up in {dashboardQuery.data.monthLabel}</CardTitle
							>
							<CardDescription>
								contracts with a scheduled due on or before today this month, or an overdue
								defaulted balance that still needs follow-up.
							</CardDescription>
						</div>
						<div
							class="rounded-full border bg-muted/15 px-3 py-1 text-xs font-medium text-muted-foreground"
						>
							{dashboardQuery.data.followUps.length} open follow-up{dashboardQuery.data.followUps
								.length === 1
								? ''
								: 's'}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{#if dashboardQuery.data.followUps.length === 0}
						<p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
							no payment follow-up is needed right now.
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
														{item.status}
													</Badge>
													{#if hasActiveOverdueFollowUp(item)}
														<Badge variant="destructive">overdue</Badge>
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
														open payments
													</a>
												</div>
											</div>

											<div class="grid gap-3 sm:grid-cols-3">
												<div class="rounded-lg border bg-background/70 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">phone</p>
													<p class="mt-1 text-sm font-medium text-foreground">{item.tenantPhone}</p>
												</div>
												<div class="rounded-lg border bg-background/70 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">cycle</p>
													<p class="mt-1 text-sm font-medium text-foreground capitalize">
														{intervalLabels[item.interval]}
													</p>
												</div>
												<div class="rounded-lg border bg-background/70 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														contract ends
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
														{formatCurrency(getFollowUpTotalBalance(item))} SAR
													</p>
												</div>
												<div class="rounded-lg border bg-muted/15 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														received this month
													</p>
													<p class="mt-1 text-sm font-semibold text-foreground">
														{formatCurrency(item.collectedThisMonth)} SAR
													</p>
												</div>
												<div class="rounded-lg border bg-muted/15 p-3">
													<p class="text-xs tracking-wide text-muted-foreground uppercase">
														{followUpRemainingLabel}
													</p>
													<p class="mt-1 text-sm font-semibold text-foreground">
														{formatCurrency(progress.remainingAmount)} SAR
													</p>
												</div>
											</div>

											<div class="mt-4 rounded-lg border bg-muted/15 p-3">
												<div class="flex items-center justify-between gap-3 text-sm">
													<span class="font-medium">{followUpProgressLabel}</span>
													<span class="text-muted-foreground">
														{formatCurrency(progress.coveredAmount)} / {formatCurrency(
															progress.coveredAmount + progress.remainingAmount
														)} SAR
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
													<span>{formatCurrency(progress.remainingAmount)} SAR remaining</span>
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
					<p class="text-sm text-muted-foreground">dashboard data is unavailable right now.</p>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
