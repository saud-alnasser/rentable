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
	import DashboardFollowUpCard from './dashboard-follow-up-card.svelte';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;

	let { data }: { data: DashboardData } = $props();

	const dashboardVirtualListClass =
		'rounded-[1.5rem] border border-border/50 bg-background/30 backdrop-blur-xl [box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.05),0_16px_36px_rgb(15_23_42_/_0.14)] dark:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.04),0_16px_36px_rgb(2_6_23_/_0.32)]';
	const dashboardVirtualListPaddingClass = 'p-2 sm:p-3';
	const followUpVirtualThreshold = 2;
	const followUpVirtualEstimate = 320;
	const followUpVirtualGap = 16;
	const followUpVirtualViewportHeight = 'min(70vh, 52rem)';

	let viewportRef = $state<HTMLElement | null>(null);
	let followUpRecords = $derived(data.followUps);
	let shouldUseVirtualFollowUps = $derived(followUpRecords.length >= followUpVirtualThreshold);
	let followUpMeasureKeys = $derived(followUpRecords.map((item) => String(item.contractId)));

	const followUpVirtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => null,
		estimateSize: () => followUpVirtualEstimate,
		overscan: 3,
		gap: followUpVirtualGap,
		enabled: false
	});

	let virtualFollowUpItems = $derived($followUpVirtualizer.getVirtualItems());
	let followUpPaddingTop = $derived(virtualFollowUpItems[0]?.start ?? 0);
	let followUpPaddingBottom = $derived(
		Math.max(
			$followUpVirtualizer.getTotalSize() -
				(virtualFollowUpItems[virtualFollowUpItems.length - 1]?.end ?? 0),
			0
		)
	);

	$effect(() => {
		get(followUpVirtualizer).setOptions({
			count: followUpRecords.length,
			getScrollElement: () => viewportRef,
			estimateSize: () => followUpVirtualEstimate,
			getItemKey: (index) => followUpMeasureKeys[index] ?? index,
			overscan: 3,
			gap: followUpVirtualGap,
			enabled: browser && shouldUseVirtualFollowUps && !!viewportRef
		});
	});

	$effect(() => {
		if (!shouldUseVirtualFollowUps || !viewportRef) return;

		const measureKeyCount = followUpMeasureKeys.length;

		void tick().then(() => {
			if (measureKeyCount !== followUpMeasureKeys.length) {
				return;
			}

			get(followUpVirtualizer).measure();
		});
	});

	function measureFollowUp(node: HTMLDivElement, measureKey: string) {
		const instance = get(followUpVirtualizer);
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
</script>

<Card class="gap-4 overflow-hidden">
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<div class="flex flex-wrap items-start justify-between gap-3 rtl:flex-row-reverse">
			<div class="space-y-1 text-start">
				<CardTitle>{$LL.dashboard.followUps.title({ monthLabel: data.monthLabel })}</CardTitle>
				<CardDescription>{$LL.dashboard.followUps.description()}</CardDescription>
			</div>
			<div
				class="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm"
			>
				{followUpRecords.length === 1
					? $LL.dashboard.followUps.countOne({ count: 1 })
					: $LL.dashboard.followUps.countOther({ count: followUpRecords.length })}
			</div>
		</div>
	</CardHeader>
	<CardContent class="pt-5">
		{#if followUpRecords.length === 0}
			<p
				class="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground"
			>
				{$LL.dashboard.followUps.empty()}
			</p>
		{:else if shouldUseVirtualFollowUps}
			<ScrollArea
				bind:viewportRef
				class={dashboardVirtualListClass}
				style={`height: ${followUpVirtualViewportHeight};`}
			>
				<div class={cn('relative w-full', dashboardVirtualListPaddingClass)}>
					{#if followUpPaddingTop > 0}
						<div aria-hidden="true" style={`height: ${followUpPaddingTop}px;`}></div>
					{/if}

					<div class="flex flex-col gap-4">
						{#each virtualFollowUpItems as virtualItem (virtualItem.key)}
							<div
								use:measureFollowUp={followUpMeasureKeys[virtualItem.index] ?? ''}
								class="w-full"
							>
								<DashboardFollowUpCard item={followUpRecords[virtualItem.index]} />
							</div>
						{/each}
					</div>

					{#if followUpPaddingBottom > 0}
						<div aria-hidden="true" style={`height: ${followUpPaddingBottom}px;`}></div>
					{/if}
				</div>
			</ScrollArea>
		{:else}
			<div class="space-y-4">
				{#each followUpRecords as item (item.contractId)}
					<DashboardFollowUpCard {item} />
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
