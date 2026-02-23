<script lang="ts">
	import type { Tenant } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/common/components/blocks/data-table.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { renderComponent } from '$lib/common/components/fragments/data-table';
	import { useDeleteTenant, useFetchTenants } from '$lib/resources/tenants/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import TenantForm from './tenant-form.svelte';

	let columns: ColumnDef<Tenant>[] = [
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
								isDeleteDialogOpen = true;
							}
						}
					]
				})
		}
	];

	const fetchQuery = useFetchTenants();
	const deleteMutation = useDeleteTenant();

	let isTenantFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let tenant = $state<Tenant | undefined>(undefined);
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
		}
	}}
	onSubmit={async () => {
		if (tenant) {
			await deleteMutation.mutateAsync(tenant.id);
		}
	}}
/>
