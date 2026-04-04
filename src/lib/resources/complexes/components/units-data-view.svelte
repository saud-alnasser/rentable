<script lang="ts">
	import type { Unit } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import {
		Card,
		CardAction,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import { cn } from '$lib/common/utils/tailwind';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useDeleteUnit,
		useFetchComplex,
		useInfiniteUnits
	} from '$lib/resources/complexes/hooks/queries';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UnitForm from './unit-form.svelte';

	let { complexId }: { complexId: number } = $props();

	let complexQuery = useFetchComplex(() => complexId);
	let search = $state('');
	let unitsQuery = useInfiniteUnits(() => ({ complexId, search }));
	let deleteMutation = useDeleteUnit();

	let unit = $state<Unit | undefined>(undefined);
	let isUnitFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	const unitsVirtualThreshold = 3;
	const unitsVirtualViewportHeight = 'min(72vh, 48rem)';

	const getSearchValue = (record: Unit) => [record.name, record.status].join(' ');
	let units = $derived.by(
		() => unitsQuery.data?.pages.flatMap((page: { items: Unit[] }) => page.items) ?? []
	);
	let shouldConstrainLayout = $derived(units.length >= unitsVirtualThreshold);
</script>

<div class={cn('flex flex-col gap-4', shouldConstrainLayout && 'min-h-0 flex-1')}>
	{#if complexQuery.isLoading}
		<Skeleton class="h-24 w-full" />
	{:else}
		<h1 class="text-2xl font-bold">{complexQuery.data?.name}</h1>
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
		virtualItemHeight={280}
		virtualThreshold={unitsVirtualThreshold}
		virtualViewportHeight={unitsVirtualViewportHeight}
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
				<CardHeader class="gap-3 border-b pb-4">
					<div class="space-y-2 text-start">
						<CardTitle>{record.name}</CardTitle>
						<CardDescription>{$LL.common.labels.unit()} #{record.id}</CardDescription>
						<Badge
							variant={record.status === 'vacant' ? 'secondary' : 'default'}
							class="capitalize"
						>
							{$LL.common.status[record.status]()}
						</Badge>
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
				<CardContent class="grid gap-3 pt-4 sm:grid-cols-2 [&>*]:text-start">
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.status()}
						</p>
						<p class="mt-2 text-sm font-medium capitalize">{$LL.common.status[record.status]()}</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.complex()}
						</p>
						<p class="mt-2 text-sm font-medium">{complexQuery.data?.name}</p>
					</div>
				</CardContent>
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
