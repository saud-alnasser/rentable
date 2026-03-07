<script lang="ts">
	import type { Payment } from '$lib/api/database/schema';
	import { hasSatisfiedContractPaymentRequirement } from '$lib/api/utils/contract-status';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataTable from '$lib/common/components/blocks/data-table.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { renderComponent, renderSnippet } from '$lib/common/components/fragments/data-table';
	import { Progress } from '$lib/common/components/fragments/progress';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import {
		useDeletePayment,
		useFetchContract,
		useFetchContractPayments
	} from '$lib/resources/contracts/hooks/queries';
	import type { ColumnDef } from '@tanstack/table-core';
	import PaymentForm from './payment-form.svelte';

	const formatDate = (value: number) =>
		new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(value)
		);

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

	let { contractId }: { contractId: number } = $props();

	const contractQuery = useFetchContract(() => contractId);
	const paymentsQuery = useFetchContractPayments(() => contractId);
	const deleteMutation = useDeletePayment();

	let payment = $state<Payment | undefined>(undefined);
	let isPaymentFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	const getContractLabel = () => {
		const govId = contractQuery.data?.govId?.trim();

		return govId || undefined;
	};

	const getPaymentsTitle = () => {
		const contractLabel = getContractLabel();

		return contractLabel ? `Payments for ${contractLabel}` : 'Payments';
	};

	let isTerminated = $derived(contractQuery.data?.status === 'terminated');
	let hasSatisfiedRequiredAmount = $derived.by(() => {
		if (!contractQuery.data) return false;

		return hasSatisfiedContractPaymentRequirement(
			contractQuery.data.paidAmount,
			contractQuery.data.expectedAmount
		);
	});
	let isAddLocked = $derived(isTerminated || hasSatisfiedRequiredAmount);
	let isDeleteLocked = $derived(isTerminated);
	let showLockNotice = $derived(isTerminated || hasSatisfiedRequiredAmount);
	let paymentProgress = $derived.by(() => {
		const paidAmount = contractQuery.data?.paidAmount ?? 0;
		const expectedAmount = contractQuery.data?.expectedAmount ?? 0;
		const progressValue = expectedAmount > 0 ? Math.min(paidAmount, expectedAmount) : 0;
		const progressPercent =
			expectedAmount > 0 ? Math.min((paidAmount / expectedAmount) * 100, 100) : 0;
		const remainingAmount = Math.max(expectedAmount - paidAmount, 0);

		return {
			paidAmount,
			expectedAmount,
			progressValue,
			progressPercent,
			remainingAmount
		};
	});

	const getLockSummary = () => {
		if (isTerminated) {
			return 'This contract is terminated and locked. Payment records are read-only.';
		}

		if (hasSatisfiedRequiredAmount) {
			return 'This contract has been fully paid. You can edit or delete payments, but you cannot add more.';
		}

		return 'Track contract payments and add new payment records from the table.';
	};

	const getLockNotice = () => {
		if (isTerminated) {
			return 'Terminated contracts are locked. You can review payment history here, but you cannot add, edit, or delete payments until the contract is unterminated.';
		}

		if (hasSatisfiedRequiredAmount) {
			return 'This contract has already reached its required total payment amount. You can still edit or delete payments if needed, but you cannot add more until the paid total drops below the required amount.';
		}

		return undefined;
	};

	let columns = $derived.by((): ColumnDef<Payment>[] => [
		{
			accessorKey: 'date',
			header: 'payment date',
			cell: ({ row }) => renderSnippet(DateCell, { value: row.original.date })
		},
		{
			accessorKey: 'amount',
			header: 'amount',
			cell: ({ row }) => renderSnippet(AmountCell, { value: row.original.amount })
		},
		...(!isDeleteLocked
			? [
					{
						id: 'actions',
						cell: ({ row }: { row: { original: Payment } }) =>
							renderComponent(DataTableActionsDropdown, {
								actions: [
									{
										label: 'edit',
										onclick: () => {
											payment = row.original;
											isPaymentFormOpen = true;
										}
									},
									{
										label: 'delete',
										onclick: () => {
											payment = row.original;
											isDeleteDialogOpen = true;
										}
									}
								]
							})
					}
				]
			: [])
	]);
</script>

{#if contractQuery.isLoading}
	<Skeleton class="h-10 w-full" />
{:else}
	<div class="mb-4 space-y-1">
		<h1 class="text-2xl font-bold">{getPaymentsTitle()}</h1>
		<p class="text-sm text-muted-foreground">
			{getLockSummary()}
		</p>
	</div>
{/if}

{#if contractQuery.data}
	<div class="mb-4 rounded-md border bg-card p-4">
		<div class="mb-2 flex items-center justify-between gap-3 text-sm">
			<span class="font-medium">payment fulfillment</span>
			<span class="text-muted-foreground">
				{formatCurrency(paymentProgress.paidAmount)} / {formatCurrency(
					paymentProgress.expectedAmount
				)}
				SAR
			</span>
		</div>

		<Progress
			value={paymentProgress.progressValue}
			max={Math.max(paymentProgress.expectedAmount, 1)}
			class="h-3 bg-emerald-500/15 **:data-[slot=progress-indicator]:bg-emerald-600"
		/>

		<div class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
			<span>{Math.round(paymentProgress.progressPercent)}% fulfilled</span>
			<span>{formatCurrency(paymentProgress.remainingAmount)} SAR remaining</span>
		</div>
	</div>
{/if}

{#if showLockNotice}
	<p
		class="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground"
	>
		{getLockNotice()}
	</p>
{/if}

<DataTable
	{columns}
	data={paymentsQuery.data ?? []}
	isLoading={paymentsQuery.isLoading}
	onCreate={isAddLocked
		? undefined
		: () => {
				payment = undefined;
				isPaymentFormOpen = true;
			}}
/>

<PaymentForm
	{contractId}
	value={payment}
	open={isPaymentFormOpen}
	onOpenChange={(isOpen) => {
		isPaymentFormOpen = isOpen;
		if (!isOpen) payment = undefined;
	}}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) payment = undefined;
	}}
	onSubmit={async () => {
		if (payment) {
			await deleteMutation.mutateAsync(payment.id);
		}
	}}
/>

{#snippet DateCell({ value }: { value: number })}
	<span>{formatDate(value)}</span>
{/snippet}

{#snippet AmountCell({ value }: { value: number })}
	<div class="flex flex-row gap-1">
		<span>{value}</span>
		<span>SAR</span>
	</div>
{/snippet}
