<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/design/primitive/card';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tabs from '$lib/design/primitive/tabs';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { useFetchUnit } from '$lib/complex/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import UnitContracts from './unit-contracts.svelte';

	type UnitDetailsSection = 'overview' | 'contracts';

	let {
		unitId,
		initialSection = 'overview'
	}: {
		unitId: number;
		initialSection?: UnitDetailsSection;
	} = $props();
	// eslint-disable-next-line svelte/prefer-writable-derived
	let activeSection = $state<UnitDetailsSection>('overview');

	const tabsListClass = 'grid h-auto w-full grid-cols-2';
	const tabsTriggerClass = 'capitalize';

	const unitQuery = useFetchUnit(() => unitId);

	const getSectionHref = (section: UnitDetailsSection) =>
		resolve(`/complexes/units/${unitId}${section === 'overview' ? '' : `?section=${section}`}`);

	$effect(() => {
		activeSection = initialSection;
	});

	$effect(() => {
		if (activeSection === initialSection) {
			return;
		}

		void goto(getSectionHref(activeSection), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});
</script>

{#if unitQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-6">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
		</div>
	</div>
{:else if !unitQuery.data}
	<Card>
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const unit = unitQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div class="rounded-2xl border bg-muted p-4">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								href={resolve(`/complexes/${unit.complexId}`)}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.ui.previous()}
								class="shrink-0 rounded-full bg-secondary"
							>
								<ArrowLeftIcon class="size-4 rtl:rotate-180" />
								<span class="sr-only">{$LL.common.ui.previous()}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.ui.previous()}
					</Tooltip.Content>
				</Tooltip.Root>
			</div>

			<div class="mt-4 min-w-0 space-y-2 text-start">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{unit.complexName}
				</p>
				<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{unit.name}</h1>
				<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Cell.Status status={unit.status} />
				</div>
			</div>
		</div>

		<Tabs.Root bind:value={activeSection} class="min-h-0 flex-1 gap-3">
			<Tabs.List class={tabsListClass}>
				<Tabs.Trigger value="overview" class={tabsTriggerClass}>
					{$LL.common.labels.information()}
				</Tabs.Trigger>
				<Tabs.Trigger value="contracts" class={tabsTriggerClass}>
					{$LL.common.nav.contracts()}
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="overview" class="pb-1">
				<Card class="gap-0 overflow-hidden">
					<CardHeader class="gap-2 border-b pb-4">
						<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
					</CardHeader>
					<CardContent class="py-4">
						<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.complex()}
								</p>
								<p class="mt-3 truncate text-sm font-medium">{unit.complexName}</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.status()}
								</p>
								<p class="mt-3 flex items-center gap-2 text-sm font-medium">
									<Cell.Status status={unit.status} />
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</Tabs.Content>

			<Tabs.Content value="contracts" class="min-h-0 flex-1 pt-1">
				<UnitContracts {unitId} />
			</Tabs.Content>
		</Tabs.Root>
	</div>
{/if}
