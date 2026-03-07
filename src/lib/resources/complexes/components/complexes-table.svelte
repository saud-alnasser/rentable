<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Complex } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/common/components/blocks/data-table.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { renderComponent } from '$lib/common/components/fragments/data-table';
	import ComplexesTableUnitsCount from '$lib/resources/complexes/components/complexes-table-units-count.svelte';
	import { useDeleteComplex, useFetchComplexes } from '$lib/resources/complexes/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import ComplexForm from './complex-form.svelte';

	let columns: ColumnDef<Complex>[] = [
		{
			accessorKey: 'name',
			header: 'name'
		},
		{
			accessorKey: 'location',
			header: 'location'
		},
		{
			id: 'units',
			header: 'units',
			cell: ({ row }) => {
				return renderComponent(ComplexesTableUnitsCount, { complexId: row.original.id });
			}
		},
		{
			id: 'actions',
			cell: ({ row }) =>
				renderComponent(DataTableActionsDropdown, {
					actions: [
						{
							label: 'units management',
							onclick: () => {
								goto(resolve(`/complexes/units/${row.original.id}`));
							}
						},
						{
							label: 'edit',
							onclick: () => {
								complex = row.original;
								isComplexFormOpen = true;
							}
						},
						{
							label: 'delete',
							onclick: () => {
								complex = row.original;
								isDeleteDialogOpen = true;
							}
						}
					]
				})
		}
	];

	const fetchQuery = useFetchComplexes();
	const deleteMutation = useDeleteComplex();

	let complex = $state<Complex | undefined>(undefined);
	let isComplexFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
</script>

<DataTable
	{columns}
	data={fetchQuery.data ?? []}
	isLoading={fetchQuery.isLoading}
	onCreate={() => {
		complex = undefined;
		isComplexFormOpen = true;
	}}
/>

<ComplexForm
	open={isComplexFormOpen}
	onOpenChange={(isOpen) => {
		isComplexFormOpen = isOpen;
		if (!isOpen) complex = undefined;
	}}
	value={complex}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) {
			complex = undefined;
		}
	}}
	onSubmit={async () => {
		if (complex) {
			await deleteMutation.mutateAsync(complex.id);
		}
	}}
/>
