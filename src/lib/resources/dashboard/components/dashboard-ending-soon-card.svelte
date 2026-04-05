<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/api/database/schema';
	import api from '$lib/api/mod';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import ContractIcon from '@tabler/icons-svelte/icons/contract';

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

	const dashboardInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 shadow-sm backdrop-blur-md';
	const dashboardSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });
</script>

<div class={cn(dashboardInsetPanelClass, 'bg-background/75')}>
	<div class="space-y-4">
		<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
			<div class="flex flex-wrap items-center gap-2">
				<p class="text-start text-base font-medium">{item.tenantName}</p>
				<Badge variant={statusVariants[item.status]}>{$LL.common.status[item.status]()}</Badge>
			</div>

			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							href={resolve(`/contracts/${item.contractId}`)}
							variant="outline"
							size="icon-sm"
							aria-label={$LL.common.labels.information()}
							class="rounded-full border-border/60 bg-background/85 shadow-sm backdrop-blur-sm"
						>
							<ContractIcon class="size-4" />
							<span class="sr-only">{$LL.common.labels.information()}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}
					>{$LL.common.labels.information()}</Tooltip.Content
				>
			</Tooltip.Root>
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
</div>
