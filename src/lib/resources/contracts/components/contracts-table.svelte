<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/api/database/schema';
	import api from '$lib/api/mod';
	import {
		canManuallyTerminateContractStatus,
		canUnterminateContractStatus
	} from '$lib/api/utils/contract-status';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/common/components/blocks/data-table.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { renderComponent, renderSnippet } from '$lib/common/components/fragments/data-table';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import {
		useDeleteContract,
		useFetchContracts,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/resources/contracts/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import ContractForm from './contract-form.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	const intervalLabels: Record<Contract['interval'], string> = {
		'1m': 'monthly',
		'3m': 'quarterly',
		'6m': 'semi-annual',
		'12m': 'annual'
	};

	const statusVariants: Record<
		Contract['status'],
		'default' | 'secondary' | 'destructive' | 'outline'
	> = {
		scheduled: 'secondary',
		active: 'default',
		terminated: 'destructive',
		fulfilled: 'outline',
		expired: 'secondary',
		defaulted: 'destructive'
	};

	const statusDescriptions: Record<Contract['status'], string> = {
		scheduled: 'scheduled; starts in the future',
		active: 'active; payments on track',
		terminated: 'manually terminated; locked for changes',
		fulfilled: 'active; paid in full',
		expired: 'ended; paid in full',
		defaulted: 'ended; not paid in full'
	};

	const formatDate = (value: number) =>
		new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(value)
		);

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

	const fetchQuery = useFetchContracts();
	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	let columns: ColumnDef<ContractRow>[] = [
		{
			accessorKey: 'govId',
			header: () => renderSnippet(ContractHeader, { label: 'gov id', className: 'pe-4' }),
			cell: ({ row }) => renderSnippet(GovIdCell, { value: row.original.govId ?? '' })
		},
		{
			id: 'tenant',
			accessorFn: (row) => row.tenantName ?? `tenant #${row.tenantId}`,
			header: () => renderSnippet(ContractHeader, { label: 'tenant', className: 'ps-2' }),
			cell: ({ row }) =>
				renderSnippet(TenantName, {
					tenantName: row.original.tenantName ?? `tenant #${row.original.tenantId}`
				})
		},
		{
			accessorKey: 'start',
			header: 'start',
			cell: ({ row }) => renderSnippet(DateCell, { value: row.original.start })
		},
		{
			accessorKey: 'end',
			header: 'end',
			cell: ({ row }) => renderSnippet(DateCell, { value: row.original.end })
		},
		{
			accessorKey: 'status',
			header: 'status',
			cell: ({ row }) => renderSnippet(StatusBadge, { status: row.original.status })
		},
		{
			accessorKey: 'interval',
			header: 'cycle',
			cell: ({ row }) => intervalLabels[row.original.interval]
		},
		{
			accessorKey: 'cost',
			header: 'payment',
			cell: ({ row }) => renderSnippet(CurrencyCell, { value: row.original.cost })
		},
		{
			id: 'actions',
			cell: ({ row }) => {
				const isTerminated = row.original.status === 'terminated';

				return renderComponent(DataTableActionsDropdown, {
					actions: [
						...(!isTerminated
							? [
									{
										label: 'edit',
										onclick: () => {
											contract = row.original;
											isContractFormOpen = true;
										}
									}
								]
							: []),
						{
							label: 'units management',
							onclick: () => {
								goto(resolve(`/contracts/units/${row.original.id}`));
							}
						},
						{
							label: 'payments management',
							onclick: () => {
								goto(resolve(`/contracts/payments/${row.original.id}`));
							}
						},
						...(canManuallyTerminateContractStatus(row.original.status)
							? [
									{
										label: 'terminate',
										onclick: () => {
											contract = row.original;
											isTerminateDialogOpen = true;
										}
									}
								]
							: []),
						...(canUnterminateContractStatus(row.original.status)
							? [
									{
										label: 'unterminate',
										onclick: () => {
											contract = row.original;
											isUnterminateDialogOpen = true;
										}
									}
								]
							: []),
						{
							label: 'delete',
							onclick: () => {
								contract = row.original;
								isDeleteDialogOpen = true;
							}
						}
					]
				});
			}
		}
	];

	let contract = $state<Contract | undefined>(undefined);
	let isContractFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let isTerminateDialogOpen = $state(false);
	let isUnterminateDialogOpen = $state(false);
</script>

<DataTable
	{columns}
	data={fetchQuery.data ?? []}
	isLoading={fetchQuery.isLoading}
	onCreate={() => {
		contract = undefined;
		isContractFormOpen = true;
	}}
/>

<ContractForm
	open={isContractFormOpen}
	onOpenChange={(isOpen) => {
		isContractFormOpen = isOpen;
		if (!isOpen) contract = undefined;
	}}
	value={contract}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) {
			contract = undefined;
		}
	}}
	onSubmit={async () => {
		if (contract) {
			await deleteMutation.mutateAsync(contract.id);
		}
	}}
/>

<DeleteDialog
	open={isTerminateDialogOpen}
	onOpenChange={(isOpen) => {
		isTerminateDialogOpen = isOpen;
		if (!isOpen) {
			contract = undefined;
		}
	}}
	title="terminate contract"
	description="are you sure you want to manually terminate this contract? this only works for active or past contracts."
	confirmLabel="terminate"
	confirmLoadingLabel="terminating..."
	onSubmit={async () => {
		if (contract) {
			await terminateMutation.mutateAsync(contract.id);
		}
	}}
/>

<DeleteDialog
	open={isUnterminateDialogOpen}
	onOpenChange={(isOpen) => {
		isUnterminateDialogOpen = isOpen;
		if (!isOpen) {
			contract = undefined;
		}
	}}
	title="restore contract"
	description="are you sure you want to remove the manual termination from this contract?"
	confirmLabel="unterminate"
	confirmLoadingLabel="restoring..."
	confirmVariant="default"
	onSubmit={async () => {
		if (contract) {
			await unterminateMutation.mutateAsync(contract.id);
		}
	}}
/>

{#snippet ContractHeader({ label, className }: { label: string; className?: string })}
	<span class={`inline-block ${className ?? ''}`}>{label}</span>
{/snippet}

{#snippet GovIdCell({ value }: { value: string })}
	<span class="inline-block max-w-20 truncate align-bottom" title={value}>{value}</span>
{/snippet}

{#snippet TenantName({ tenantName }: { tenantName: string })}
	<span class="inline-block max-w-24 truncate align-bottom" title={tenantName}>
		{tenantName}
	</span>
{/snippet}

{#snippet DateCell({ value }: { value: number })}
	<span>{formatDate(value)}</span>
{/snippet}

{#snippet CurrencyCell({ value }: { value: number })}
	<div class="flex flex-row gap-1">
		<span>{formatCurrency(value)}</span>
		<span>SAR</span>
	</div>
{/snippet}

{#snippet StatusBadge({ status }: { status: Contract['status'] })}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="inline-flex">
					<Badge variant={statusVariants[status]} class="capitalize">
						{status}
					</Badge>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-60" side="top">
			{statusDescriptions[status]}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}
