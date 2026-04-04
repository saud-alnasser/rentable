<script lang="ts">
	import type { Contract } from '$lib/api/database/schema';
	import api from '$lib/api/mod';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;
	type EndingSoonItem = DashboardData['endingSoonContracts'][number];

	let { item }: { item: EndingSoonItem } = $props();

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

	const dashboardInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 shadow-sm backdrop-blur-md';
	const dashboardSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });
</script>

<div class={`${dashboardInsetPanelClass} bg-background/75`}>
	<div class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<p class="text-start text-base font-medium">{item.tenantName}</p>
			<Badge variant={statusVariants[item.status]}>{$LL.common.status[item.status]()}</Badge>
			{#if item.govId}
				<Badge variant="outline">{item.govId}</Badge>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-3 [&>*]:text-start">
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
					{$LL.common.labels.cycle()}
				</p>
				<p class="mt-1 text-sm font-medium text-foreground capitalize">
					{$LL.contracts.intervals[intervalLabels[item.interval]]()}
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
</div>
