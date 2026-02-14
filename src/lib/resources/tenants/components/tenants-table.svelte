<script lang="ts">
	import type { Tenant } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/common/components/blocks/data-table.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Checkbox } from '$lib/common/components/fragments/checkbox';
	import { renderComponent } from '$lib/common/components/fragments/data-table';
	import {
		useDeleteTenant,
		useDeleteTenants,
		useFetchTenants
	} from '$lib/resources/tenants/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import TenantForm from './tenant-form.svelte';

	let columns: ColumnDef<Tenant>[] = [
		{
			id: 'select',
			header: ({ table }) =>
				renderComponent(Checkbox, {
					checked: table.getIsAllPageRowsSelected(),
					indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
					onCheckedChange: (value) => table.toggleAllPageRowsSelected(!!value),
					'aria-label': 'select all'
				}),
			cell: ({ row }) =>
				renderComponent(Checkbox, {
					checked: row.getIsSelected(),
					onCheckedChange: (value) => row.toggleSelected(!!value),
					'aria-label': 'select row'
				}),
			enableSorting: false,
			enableHiding: false
		},
		{
			accessorKey: 'nationalId',
			header: 'national id'
		},
		{
			accessorKey: 'name',
			header: 'name'
		},
		{
			accessorKey: 'phone',
			header: 'phone'
		},
		{
			id: 'actions',
			header: ({ table }) => {
				const selected = table.getSelectedRowModel().rows;

				if (!selected.length) return null;

				return renderComponent(DataTableActionsDropdown, {
					actions: [
						{
							label: `delete (${selected.length})`,
							onclick: async () => {
								selectedIds = selected.map((r) => r.original.id);
								tenant = undefined;
								isDeleteDialogOpen = true;
							}
						}
					]
				});
			},
			cell: ({ row }) =>
				renderComponent(DataTableActionsDropdown, {
					actions: [
						{
							label: 'edit',
							onclick: () => {
								tenant = row.original;
								isTenantFormOpen = true;
							}
						},
						{
							label: 'delete',
							onclick: async () => {
								tenant = row.original;
								selectedIds = [];
								isDeleteDialogOpen = true;
							}
						}
					]
				})
		}
	];

	const fetchQuery = useFetchTenants();
	const deleteMutation = useDeleteTenant();
	const deleteManyMutation = useDeleteTenants();

	let isTenantFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let tenant = $state<Tenant | undefined>(undefined);
	let selectedIds = $state<number[]>([]);
</script>

<DataTable
	{columns}
	data={fetchQuery.data ?? []}
	isLoading={fetchQuery.isLoading}
	onCreate={() => {
		tenant = undefined;
		isTenantFormOpen = true;
	}}
/>

<TenantForm
	open={isTenantFormOpen}
	onOpenChange={(isOpen) => {
		isTenantFormOpen = isOpen;
		if (!isOpen) tenant = undefined;
	}}
	value={tenant}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) {
			tenant = undefined;
			selectedIds = [];
		}
	}}
	onSubmit={async () => {
		if (selectedIds.length > 0) {
			await deleteManyMutation.mutateAsync(selectedIds);
			return;
		}

		if (tenant) {
			await deleteMutation.mutateAsync(tenant.id);
		}
	}}
/>
