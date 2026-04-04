<script lang="ts">
	import api from '$lib/api/mod';
	import { formatLocaleValueWithUnit } from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import DashboardSummaryCard from './dashboard-summary-card.svelte';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;

	type SummarySection = {
		id: string;
		title: string;
		description: string;
		heroLabel: string;
		heroValue: string;
		heroHint: string;
		heroClass: string;
		stats: { id: string; label: string; value: string }[];
	};

	let { data }: { data: DashboardData } = $props();

	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
	const formatNoticeWindow = (days: number) =>
		days === 1 ? $LL.common.time.day({ count: days }) : $LL.common.time.days({ count: days });

	const getSummarySections = (dashboard: DashboardData): SummarySection[] => [
		{
			id: 'contracts',
			title: $LL.dashboard.sections.contracts.title(),
			description: $LL.dashboard.sections.contracts.description({
				noticeWindow: formatNoticeWindow(dashboard.endingSoonNoticeDays)
			}),
			heroLabel: $LL.dashboard.sections.contracts.heroLabel(),
			heroValue: String(dashboard.summary.contracts.total),
			heroHint: $LL.dashboard.sections.contracts.heroHint({
				active: dashboard.summary.contracts.active,
				endingSoon: dashboard.summary.contracts.endingSoon,
				noticeWindow: formatNoticeWindow(dashboard.endingSoonNoticeDays)
			}),
			heroClass: 'border-sky-500/20 bg-sky-500/10',
			stats: [
				{
					id: 'active',
					label: $LL.common.status.active(),
					value: $LL.dashboard.stats.activeEndingWithin({
						active: dashboard.summary.contracts.active,
						endingSoon: dashboard.summary.contracts.endingSoon,
						noticeWindow: formatNoticeWindow(dashboard.endingSoonNoticeDays)
					})
				},
				{
					id: 'scheduled',
					label: $LL.common.status.scheduled(),
					value: String(dashboard.summary.contracts.scheduled)
				},
				{
					id: 'fulfilled',
					label: $LL.common.status.fulfilled(),
					value: String(dashboard.summary.contracts.fulfilled)
				},
				{
					id: 'expired',
					label: $LL.common.status.expired(),
					value: String(dashboard.summary.contracts.expired)
				},
				{
					id: 'defaulted',
					label: $LL.common.status.defaulted(),
					value: String(dashboard.summary.contracts.defaulted)
				},
				{
					id: 'terminated',
					label: $LL.common.status.terminated(),
					value: String(dashboard.summary.contracts.terminated)
				}
			]
		},
		{
			id: 'money',
			title: $LL.dashboard.sections.money.title(),
			description: $LL.dashboard.sections.money.description({ monthLabel: dashboard.monthLabel }),
			heroLabel: $LL.dashboard.sections.money.heroLabel(),
			heroValue: formatMoney(dashboard.summary.money.outstandingNow),
			heroHint: $LL.dashboard.sections.money.heroHint({
				rate: dashboard.summary.money.monthlyCollectionRate,
				monthLabel: dashboard.monthLabel
			}),
			heroClass: 'border-emerald-500/20 bg-emerald-500/10',
			stats: [
				{
					id: 'dueThisMonth',
					label: $LL.dashboard.stats.dueThisMonth(),
					value: formatMoney(dashboard.summary.money.dueThisMonth)
				},
				{
					id: 'receivedThisMonth',
					label: $LL.dashboard.stats.receivedThisMonth(),
					value: formatMoney(dashboard.summary.money.collectedThisMonth)
				},
				{
					id: 'stillDueThisMonth',
					label: $LL.dashboard.stats.stillDueThisMonth(),
					value: formatMoney(dashboard.summary.money.remainingThisMonth)
				},
				{
					id: 'overallCollectionRate',
					label: $LL.dashboard.stats.overallCollectionRate(),
					value: `${dashboard.summary.money.overallCollectionRate}%`
				},
				{
					id: 'totalExpectedAmount',
					label: $LL.dashboard.stats.totalExpectedAmount(),
					value: formatMoney(dashboard.summary.money.totalExpectedAmount)
				}
			]
		},
		{
			id: 'occupancy',
			title: $LL.dashboard.sections.occupancy.title(),
			description: $LL.dashboard.sections.occupancy.description(),
			heroLabel: $LL.dashboard.sections.occupancy.heroLabel(),
			heroValue: `${dashboard.summary.occupancy.occupancyRate}%`,
			heroHint: $LL.dashboard.sections.occupancy.heroHint({
				occupied: dashboard.summary.occupancy.occupiedUnits,
				total: dashboard.summary.occupancy.totalUnits
			}),
			heroClass: 'border-violet-500/20 bg-violet-500/10',
			stats: [
				{
					id: 'totalUnits',
					label: $LL.dashboard.stats.totalUnits(),
					value: String(dashboard.summary.occupancy.totalUnits)
				},
				{
					id: 'occupiedUnits',
					label: $LL.dashboard.stats.occupiedUnits(),
					value: String(dashboard.summary.occupancy.occupiedUnits)
				},
				{
					id: 'vacantUnits',
					label: $LL.dashboard.stats.vacantUnits(),
					value: String(dashboard.summary.occupancy.vacantUnits)
				},
				{
					id: 'vacancyRate',
					label: $LL.dashboard.stats.vacancyRate(),
					value: `${dashboard.summary.occupancy.vacancyRate}%`
				}
			]
		}
	];
</script>

<div class="grid gap-4 xl:grid-cols-3">
	{#each getSummarySections(data) as section (section.id)}
		<DashboardSummaryCard {section} />
	{/each}
</div>
