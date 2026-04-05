<script lang="ts">
	import { browser } from '$app/environment';
	import api from '$lib/api/mod';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { ScrollArea } from '$lib/common/components/fragments/scroll-area';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { tick } from 'svelte';
	import { get } from 'svelte/store';
	import { cn } from 'tailwind-variants';
	import DashboardEndingSoonCard from './dashboard-ending-soon-card.svelte';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;

	let { data }: { data: DashboardData } = $props();

	const dashboardVirtualListClass =
		'rounded-[1.5rem] border border-border/50 bg-background/30 backdrop-blur-xl [box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.05),0_16px_36px_rgb(15_23_42_/_0.14)] dark:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.04),0_16px_36px_rgb(2_6_23_/_0.32)]';
	const dashboardVirtualListPaddingClass = 'p-2 sm:p-3';
	const endingSoonVirtualThreshold = 2;
	const endingSoonVirtualEstimate = 220;
	const endingSoonVirtualGap = 16;
	const endingSoonVirtualViewportHeight = 'min(56vh, 38rem)';

	let viewportRef = $state<HTMLElement | null>(null);
	let records = $derived(data.endingSoonContracts);
	let shouldUseVirtualEndingSoon = $derived(records.length >= endingSoonVirtualThreshold);
	let measureKeys = $derived(records.map((item) => String(item.contractId)));

	const endingSoonVirtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => null,
		estimateSize: () => endingSoonVirtualEstimate,
		overscan: 3,
		gap: endingSoonVirtualGap,
		enabled: false
	});

	let virtualItems = $derived($endingSoonVirtualizer.getVirtualItems());
	let paddingTop = $derived(virtualItems[0]?.start ?? 0);
	let paddingBottom = $derived(
		Math.max(
			$endingSoonVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0),
			0
		)
	);

	$effect(() => {
		get(endingSoonVirtualizer).setOptions({
			count: records.length,
			getScrollElement: () => viewportRef,
			estimateSize: () => endingSoonVirtualEstimate,
			getItemKey: (index) => measureKeys[index] ?? index,
			overscan: 3,
			gap: endingSoonVirtualGap,
			enabled: browser && shouldUseVirtualEndingSoon && !!viewportRef
		});
	});

	$effect(() => {
		if (!shouldUseVirtualEndingSoon || !viewportRef) return;

		const measureKeyCount = measureKeys.length;

		void tick().then(() => {
			if (measureKeyCount !== measureKeys.length) {
				return;
			}

			get(endingSoonVirtualizer).measure();
		});
	});

	function measureEndingSoon(node: HTMLDivElement, measureKey: string) {
		const instance = get(endingSoonVirtualizer);
		instance.measureElement(node);

		return {
			update(nextMeasureKey: string) {
				if (nextMeasureKey !== measureKey) {
					measureKey = nextMeasureKey;
				}

				instance.measureElement(node);
			},
			destroy() {
				instance.measureElement(null);
			}
		};
	}

	const formatNoticeWindow = (days: number) =>
		days === 1 ? $LL.common.time.day({ count: days }) : $LL.common.time.days({ count: days });
</script>

<Card class="gap-4 overflow-hidden">
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<div class="flex flex-wrap items-start justify-between gap-3 rtl:flex-row-reverse">
			<div class="space-y-1 text-start">
				<CardTitle>{$LL.dashboard.endingSoon.title()}</CardTitle>
				<CardDescription>
					{$LL.dashboard.endingSoon.description({
						noticeWindow: formatNoticeWindow(data.endingSoonNoticeDays)
					})}
				</CardDescription>
			</div>
			<div
				class="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm"
			>
				{records.length === 1
					? $LL.dashboard.endingSoon.countOne({ count: records.length })
					: $LL.dashboard.endingSoon.countOther({ count: records.length })}
			</div>
		</div>
	</CardHeader>
	<CardContent class="pt-5">
		{#if records.length === 0}
			<p
				class="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground"
			>
				{$LL.dashboard.endingSoon.empty()}
			</p>
		{:else if shouldUseVirtualEndingSoon}
			<ScrollArea
				bind:viewportRef
				class={dashboardVirtualListClass}
				style={`height: ${endingSoonVirtualViewportHeight};`}
			>
				<div class={cn('relative w-full', dashboardVirtualListPaddingClass)}>
					{#if paddingTop > 0}
						<div aria-hidden="true" style={`height: ${paddingTop}px;`}></div>
					{/if}

					<div class="flex flex-col gap-4">
						{#each virtualItems as virtualItem (virtualItem.key)}
							<div use:measureEndingSoon={measureKeys[virtualItem.index] ?? ''} class="w-full">
								<DashboardEndingSoonCard item={records[virtualItem.index]} />
							</div>
						{/each}
					</div>

					{#if paddingBottom > 0}
						<div aria-hidden="true" style={`height: ${paddingBottom}px;`}></div>
					{/if}
				</div>
			</ScrollArea>
		{:else}
			<div class="space-y-4">
				{#each records as item (item.contractId)}
					<DashboardEndingSoonCard {item} />
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
