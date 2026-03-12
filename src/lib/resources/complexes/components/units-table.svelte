<script lang="ts">
	import { type Unit } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/common/components/blocks/data-table.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { renderComponent, renderSnippet } from '$lib/common/components/fragments/data-table';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useDeleteUnit,
		useFetchComplex,
		useFetchUnits
	} from '$lib/resources/complexes/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import UnitForm from './unit-form.svelte';

	let columns = $derived.by((): ColumnDef<Unit>[] => [
		{
			accessorKey: 'name',
			header: $LL.common.labels.name()
		},
		{
			accessorKey: 'status',
			header: $LL.common.labels.status(),
			cell: ({ row }) => {
				return renderSnippet(StatusBadge, { status: row.original.status });
			}
		},
		{
			id: 'actions',
			cell: ({ row }) => {
				return renderComponent(DataTableActionsDropdown, {
					actions: [
						{
							label: $LL.common.actions.edit(),
							onclick: () => {
								unit = row.original;
								isUnitFormOpen = true;
							}
						},
						{
							label: $LL.common.actions.delete(),
							onclick: async () => {
								unit = row.original;
								isDeleteDialogOpen = true;
							}
						}
					]
				});
			}
		}
	]);

	let { complexId }: { complexId: number } = $props();

	let complexQuery = useFetchComplex(() => complexId);
	let unitsQuery = useFetchUnits(() => complexId);
	let deleteMutation = useDeleteUnit();

	let unit = $state<Unit | undefined>(undefined);
	let isUnitFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
</script>

{#if complexQuery.isLoading}
	<Skeleton class="h-24 w-full" />
{:else}
	<h1 class="text-2xl font-bold">{complexQuery.data?.name}</h1>
{/if}

<DataTable
	{columns}
	data={unitsQuery.data ?? []}
	isLoading={unitsQuery.isLoading}
	onCreate={() => {
		unit = undefined;
		isUnitFormOpen = true;
	}}
/>

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
		if (!isOpen) {
			unit = undefined;
		}
	}}
	onSubmit={async () => {
		if (unit) {
			await deleteMutation.mutateAsync(unit.id);
		}
	}}
/>

{#snippet StatusBadge({ status }: { status: Unit['status'] })}
	<Badge variant={status === 'vacant' ? 'secondary' : 'default'} class="capitalize">
		{$LL.common.status[status]()}
	</Badge>
{/snippet}
