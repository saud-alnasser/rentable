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
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import {
		Card,
		CardAction,
		CardContent,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Progress } from '$lib/common/components/fragments/progress';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useDeleteContract,
		useFetchContracts,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/resources/contracts/hooks/queries';
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
		new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(value)
		);

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

	const getTenantLabel = (record: ContractRow) =>
		record.tenantName ?? $LL.contracts.table.tenantFallback({ tenantId: String(record.tenantId) });

	const getDisplayGovId = (record: ContractRow) => record.govId?.trim() || '';
	const getDisplayTenantPhone = (record: ContractRow) => record.tenantPhone?.trim() || '';

	const getContractTitle = (record: ContractRow) => getTenantLabel(record);

	const getPaymentProgress = (record: ContractRow) => {
		const paidAmount = record.paidAmount ?? 0;
		const expectedAmount = record.expectedAmount ?? 0;
		const progressValue = expectedAmount > 0 ? Math.min(paidAmount, expectedAmount) : 0;
		const progressPercent =
			expectedAmount > 0 ? Math.min((paidAmount / expectedAmount) * 100, 100) : 0;
		const remainingAmount = Math.max(expectedAmount - paidAmount, 0);

		return { paidAmount, expectedAmount, progressValue, progressPercent, remainingAmount };
	};

	const fetchQuery = useFetchContracts();
	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	let contract = $state<Contract | undefined>(undefined);
	let isContractFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let isTerminateDialogOpen = $state(false);
	let isUnterminateDialogOpen = $state(false);

	const getSearchValue = (record: ContractRow) =>
		[
			record.govId,
			record.tenantName,
			record.tenantPhone,
			String(record.tenantId),
			record.status,
			record.interval,
			String(record.cost)
		]
			.filter(Boolean)
			.join(' ');
</script>

<DataView
	data={fetchQuery.data ?? []}
	isLoading={fetchQuery.isLoading}
	isFetching={fetchQuery.isFetching}
	{getSearchValue}
	onCreate={() => {
		contract = undefined;
		isContractFormOpen = true;
	}}
>
	{#snippet item(record: ContractRow)}
		{@const paymentProgress = getPaymentProgress(record)}
		<Card class="gap-0 overflow-hidden">
			<CardHeader class="gap-4 border-b pb-4">
				<div class="min-w-0 space-y-2">
					<CardTitle class="truncate">{getContractTitle(record)}</CardTitle>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<span {...props} class="inline-flex">
									<Badge variant={statusVariants[record.status]} class="capitalize">
										{$LL.common.status[record.status]()}
									</Badge>
								</span>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content class="max-w-60" side="top">
							{statusDescriptions[record.status]()}
						</Tooltip.Content>
					</Tooltip.Root>
				</div>
				<CardAction>
					<DataTableActionsDropdown
						actions={[
							...(record.status !== 'terminated'
								? [
										{
											label: $LL.common.actions.edit(),
											onclick: () => {
												contract = record;
												isContractFormOpen = true;
											}
										}
									]
								: []),
							{
								label: $LL.contracts.table.unitsManagement(),
								onclick: () => goto(resolve(`/contracts/units/${record.id}`))
							},
							{
								label: $LL.contracts.table.paymentsManagement(),
								onclick: () => goto(resolve(`/contracts/payments/${record.id}`))
							},
							...(canManuallyTerminateContractStatus(record.status)
								? [
										{
											label: $LL.common.actions.terminate(),
											onclick: () => {
												contract = record;
												isTerminateDialogOpen = true;
											}
										}
									]
								: []),
							...(canUnterminateContractStatus(record.status)
								? [
										{
											label: $LL.common.actions.unterminate(),
											onclick: () => {
												contract = record;
												isUnterminateDialogOpen = true;
											}
										}
									]
								: []),
							{
								label: $LL.common.actions.delete(),
								onclick: () => {
									contract = record;
									isDeleteDialogOpen = true;
								}
							}
						]}
					/>
				</CardAction>
			</CardHeader>
			<CardContent class="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-2">
				<div class="rounded-lg border bg-muted/10 p-4 sm:col-span-2 xl:col-span-2">
					<div class="flex items-center justify-between gap-3 text-sm">
						<div>
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.paymentFulfillment()}
							</p>
							<p class="mt-1 font-medium">
								{formatCurrency(paymentProgress.paidAmount)} / {formatCurrency(
									paymentProgress.expectedAmount
								)}
								{$LL.common.messages.sar()}
							</p>
						</div>
						<p class="text-xs text-muted-foreground">
							{$LL.contracts.payments.percentFulfilled({
								percent: String(Math.round(paymentProgress.progressPercent))
							})}
						</p>
					</div>
					<Progress
						value={paymentProgress.progressValue}
						max={Math.max(paymentProgress.expectedAmount, 1)}
						class="mt-3 h-2.5 bg-emerald-500/15 **:data-[slot=progress-indicator]:bg-emerald-600"
					/>
					<p class="mt-2 text-xs text-muted-foreground">
						{$LL.contracts.payments.remaining({
							amount: formatCurrency(paymentProgress.remainingAmount)
						})}
					</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.governmentId()}
					</p>
					<p class="mt-2 text-sm font-medium">
						{getDisplayGovId(record) || $LL.common.messages.unknown()}
					</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.phone()}
					</p>
					<p class="mt-2 text-sm font-medium" dir="ltr">
						{getDisplayTenantPhone(record) || $LL.common.messages.unknown()}
					</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.cycle()}
					</p>
					<p class="mt-2 text-sm font-medium">{intervalLabels[record.interval]()}</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.payment()}
					</p>
					<p class="mt-2 text-sm font-medium">
						{formatCurrency(record.cost)}
						{$LL.common.messages.sar()}
					</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.start()}
					</p>
					<p class="mt-2 text-sm font-medium">{formatDate(record.start)}</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.end()}
					</p>
					<p class="mt-2 text-sm font-medium">{formatDate(record.end)}</p>
				</div>
			</CardContent>
		</Card>
	{/snippet}
</DataView>

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
		if (!isOpen) contract = undefined;
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
		if (!isOpen) contract = undefined;
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
		if (!isOpen) contract = undefined;
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
