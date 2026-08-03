<script lang="ts">
	import type { Tenant } from '$lib/platform/database/schema';
	import DataTableActionsDropdown from '$lib/design/block/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/design/block/data-table.svelte';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import { renderComponent } from '$lib/design/primitive/data-table';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useDeleteTenant, useFetchTenants } from '$lib/tenant/query';
	import type { ColumnDef } from '@tanstack/table-core';
	import TenantForm from './form.svelte';

	let columns = $derived.by((): ColumnDef<Tenant>[] => [
		{
			accessorKey: 'nationalId',
			header: $LL.common.labels.nationalId()
		},
		{
			accessorKey: 'name',
			header: $LL.common.labels.name()
		},
		{
			accessorKey: 'phone',
			header: $LL.common.labels.phone()
		},
		{
			id: 'actions',
			cell: ({ row }) =>
				renderComponent(DataTableActionsDropdown, {
					actions: [
						{
							label: $LL.common.actions.edit(),
							onclick: () => {
								tenant = row.original;
								isTenantFormOpen = true;
							}
						},
						{
							label: $LL.common.actions.delete(),
							onclick: async () => {
								tenant = row.original;
								isDeleteDialogOpen = true;
							}
						}
					]
				})
		}
	]);

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
