<script lang="ts">
	import type { Unit } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import { Card, CardAction, CardHeader, CardTitle } from '$lib/common/components/fragments/card';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useDeleteUnit,
		useFetchComplex,
		useInfiniteUnits
	} from '$lib/resources/complexes/hooks/queries';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UnitForm from './unit-form.svelte';

	let {
		complexId,
		backHref,
		showHeader = true
	}: {
		complexId: number;
		backHref?: string;
		showHeader?: boolean;
	} = $props();

	let complexQuery = useFetchComplex(() => complexId);
	let search = $state('');
	let unitsQuery = useInfiniteUnits(() => ({ complexId, search }));
	let deleteMutation = useDeleteUnit();

	let unit = $state<Unit | undefined>(undefined);
	let isUnitFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	const standaloneVirtualThreshold = 3;
	const embeddedVirtualThreshold = 3;
	const standaloneVirtualViewportHeight = 'min(72vh, 48rem)';
	const embeddedVirtualViewportHeight = '24rem';

	const getSearchValue = (record: Unit) => [record.name, record.status].join(' ');
	let units = $derived.by(
		() => unitsQuery.data?.pages.flatMap((page: { items: Unit[] }) => page.items) ?? []
	);
	let unitsVirtualThreshold = $derived(
		showHeader ? standaloneVirtualThreshold : embeddedVirtualThreshold
	);
	let unitsVirtualViewportHeight = $derived(
		showHeader ? standaloneVirtualViewportHeight : embeddedVirtualViewportHeight
	);
	let maxColumns = $derived(showHeader ? undefined : 2);
	let shouldConstrainLayout = $derived(units.length >= unitsVirtualThreshold);
</script>

<div class={cn('flex flex-col gap-3', shouldConstrainLayout && 'min-h-0 flex-1')}>
	{#if showHeader}
		{#if complexQuery.isLoading}
			<Skeleton class="h-24 w-full" />
		{:else}
			<div class="space-y-2">
				{#if backHref}
					<div class="flex items-center gap-3 rtl:flex-row-reverse">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										href={backHref}
										variant="outline"
										size="icon-sm"
										aria-label={$LL.common.ui.previous()}
										class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
									>
										<ArrowLeftIcon class="size-4 rtl:rotate-180" />
										<span class="sr-only">{$LL.common.ui.previous()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>{$LL.common.ui.previous()}</Tooltip.Content
							>
						</Tooltip.Root>
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.nav.complexes()}
						</p>
					</div>
				{/if}
				<div class="space-y-1">
					<h1 class="text-2xl font-semibold tracking-tight">{complexQuery.data?.name}</h1>
					<p class="text-sm text-muted-foreground">{$LL.complexes.units.management()}</p>
				</div>
			</div>
		{/if}
	{/if}

	<DataView
		data={units}
		isLoading={unitsQuery.isLoading}
		isFetching={unitsQuery.isFetching}
		hasNextPage={unitsQuery.hasNextPage}
		isFetchingNextPage={unitsQuery.isFetchingNextPage}
		fetchNextPage={() => unitsQuery.fetchNextPage()}
		bind:searchValue={search}
		{getSearchValue}
		virtualItemHeight={180}
		virtualThreshold={unitsVirtualThreshold}
		virtualViewportHeight={unitsVirtualViewportHeight}
		alwaysShowListContainer={!showHeader}
		{maxColumns}
		onCreate={() => {
			unit = undefined;
			isUnitFormOpen = true;
		}}
	>
		{#snippet item(record: Unit)}
			<Card
				class={cn(
					'gap-0 overflow-hidden border-s-4 border-border/70 bg-card/65 shadow-xl backdrop-blur-xl',
					record.status === 'vacant' ? 'border-s-emerald-500/60' : 'border-s-amber-500/60'
				)}
			>
				<CardHeader class="gap-3 pb-4">
					<div class="space-y-2 text-start">
						<div class="flex flex-wrap items-center gap-2">
							<CardTitle>{record.name}</CardTitle>
							<Badge
								variant={record.status === 'vacant' ? 'secondary' : 'default'}
								class="capitalize"
							>
								{$LL.common.status[record.status]()}
							</Badge>
						</div>
					</div>
					<CardAction>
						<DataTableActionsDropdown
							menuLabel={null}
							actions={[
								{
									label: $LL.common.actions.edit(),
									icon: SquarePenIcon,
									onclick: () => {
										unit = record;
										isUnitFormOpen = true;
									}
								},
								{ type: 'separator' as const },
								{
									label: $LL.common.actions.delete(),
									icon: Trash2Icon,
									variant: 'destructive' as const,
									onclick: () => {
										unit = record;
										isDeleteDialogOpen = true;
									}
								}
							]}
						/>
					</CardAction>
				</CardHeader>
			</Card>
		{/snippet}
	</DataView>
</div>

<UnitForm
	open={isUnitFormOpen}
	onOpenChange={(isOpen) => {
		isUnitFormOpen = isOpen;
		if (!isOpen) unit = undefined;
	}}
	value={unit}
	{complexId}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) unit = undefined;
	}}
	onSubmit={async () => {
		if (unit) {
			await deleteMutation.mutateAsync(unit.id);
		}
	}}
/>
