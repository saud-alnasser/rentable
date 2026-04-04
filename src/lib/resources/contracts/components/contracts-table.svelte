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
		formatLocaleDate,
		formatLocaleNumber,
		formatLocaleValueWithUnit
	} from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		useDeleteContract,
		useFetchContracts,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/resources/contracts/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import ContractForm from './contract-form.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
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

	const statusDescriptions: Record<Contract['status'], () => string> = {
		scheduled: $LL.contracts.statusDescriptions.scheduled,
		active: $LL.contracts.statusDescriptions.active,
		terminated: $LL.contracts.statusDescriptions.terminated,
		fulfilled: $LL.contracts.statusDescriptions.fulfilled,
		expired: $LL.contracts.statusDescriptions.expired,
		defaulted: $LL.contracts.statusDescriptions.defaulted
	};

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

	const formatCurrency = (value: number) => formatLocaleNumber($locale, value);
	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());

	const fetchQuery = useFetchContracts();
	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	let columns = $derived.by((): ColumnDef<ContractRow>[] => [
		{
			accessorKey: 'govId',
			header: () =>
				renderSnippet(ContractHeader, {
					label: $LL.common.labels.governmentId(),
					className: 'pe-4'
				}),
			cell: ({ row }) => renderSnippet(GovIdCell, { value: row.original.govId ?? '' })
		},
		{
			id: 'tenant',
			accessorFn: (row) =>
				row.tenantName ?? $LL.contracts.table.tenantFallback({ tenantId: String(row.tenantId) }),
			header: () =>
				renderSnippet(ContractHeader, { label: $LL.common.labels.tenant(), className: 'ps-2' }),
			cell: ({ row }) =>
				renderSnippet(TenantName, {
					tenantName:
						row.original.tenantName ??
						$LL.contracts.table.tenantFallback({ tenantId: String(row.original.tenantId) })
				})
		},
		{
			accessorKey: 'start',
			header: $LL.common.labels.start(),
			cell: ({ row }) => renderSnippet(DateCell, { value: row.original.start })
		},
		{
			accessorKey: 'end',
			header: $LL.common.labels.end(),
			cell: ({ row }) => renderSnippet(DateCell, { value: row.original.end })
		},
		{
			accessorKey: 'status',
			header: $LL.common.labels.status(),
			cell: ({ row }) => renderSnippet(StatusBadge, { status: row.original.status })
		},
		{
			accessorKey: 'interval',
			header: $LL.common.labels.cycle(),
			cell: ({ row }) => intervalLabels[row.original.interval]()
		},
		{
			accessorKey: 'cost',
			header: $LL.common.labels.payment(),
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
										label: $LL.common.actions.edit(),
										onclick: () => {
											contract = row.original;
											isContractFormOpen = true;
										}
									}
								]
							: []),
						{
							label: $LL.contracts.table.unitsManagement(),
							onclick: () => {
								goto(resolve(`/contracts/units/${row.original.id}`));
							}
						},
						{
							label: $LL.contracts.table.paymentsManagement(),
							onclick: () => {
								goto(resolve(`/contracts/payments/${row.original.id}`));
							}
						},
						...(canManuallyTerminateContractStatus(row.original.status)
							? [
									{
										label: $LL.common.actions.terminate(),
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
										label: $LL.common.actions.unterminate(),
										onclick: () => {
											contract = row.original;
											isUnterminateDialogOpen = true;
										}
									}
								]
							: []),
						{
							label: $LL.common.actions.delete(),
							onclick: () => {
								contract = row.original;
								isDeleteDialogOpen = true;
							}
						}
					]
				});
			}
		}
	]);

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
	title={$LL.contracts.table.terminateTitle()}
	description={$LL.contracts.table.terminateDescription()}
	confirmLabel={$LL.common.actions.terminate()}
	confirmLoadingLabel={$LL.common.actions.terminating()}
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
	title={$LL.contracts.table.restoreTitle()}
	description={$LL.contracts.table.restoreDescription()}
	confirmLabel={$LL.common.actions.unterminate()}
	confirmLoadingLabel={$LL.common.actions.restoring()}
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
	<span>{formatMoney(value)}</span>
{/snippet}

{#snippet StatusBadge({ status }: { status: Contract['status'] })}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="inline-flex">
					<Badge variant={statusVariants[status]} class="capitalize">
						{$LL.common.status[status]()}
					</Badge>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-60" side="top">
			{statusDescriptions[status]()}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}
