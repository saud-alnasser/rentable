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
		useInfiniteContracts,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/resources/contracts/hooks/queries';
	import BanIcon from '@lucide/svelte/icons/ban';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import ContractForm from './contract-form.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getPaginated>>['items'][number];

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

	let search = $state('');

	const fetchQuery = useInfiniteContracts(() => search);
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
	let contracts = $derived.by(
		() => fetchQuery.data?.pages.flatMap((page: { items: ContractRow[] }) => page.items) ?? []
	);
</script>

<DataView
	data={contracts}
	isLoading={fetchQuery.isLoading}
	isFetching={fetchQuery.isFetching}
	hasNextPage={fetchQuery.hasNextPage}
	isFetchingNextPage={fetchQuery.isFetchingNextPage}
	fetchNextPage={() => fetchQuery.fetchNextPage()}
	bind:searchValue={search}
	{getSearchValue}
	virtualItemHeight={420}
	onCreate={() => {
		contract = undefined;
		isContractFormOpen = true;
	}}
>
	{#snippet item(record: ContractRow)}
		{@const paymentProgress = getPaymentProgress(record)}
		<Card class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
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
						menuLabel={null}
						actions={[
							...(record.status !== 'terminated'
								? [
										{
											label: $LL.common.actions.edit(),
											icon: SquarePenIcon,
											onclick: () => {
												contract = record;
												isContractFormOpen = true;
											}
										},
										{ type: 'separator' as const }
									]
								: []),
							{
								label: $LL.contracts.table.unitsManagement(),
								icon: Building2Icon,
								onclick: () => goto(resolve(`/contracts/units/${record.id}`))
							},
							{
								label: $LL.contracts.table.paymentsManagement(),
								icon: WalletIcon,
								onclick: () => goto(resolve(`/contracts/payments/${record.id}`))
							},
							...(canManuallyTerminateContractStatus(record.status)
								? [
										{ type: 'separator' as const },
										{
											label: $LL.common.actions.terminate(),
											icon: BanIcon,
											variant: 'destructive' as const,
											onclick: () => {
												contract = record;
												isTerminateDialogOpen = true;
											}
										}
									]
								: []),
							...(canUnterminateContractStatus(record.status)
								? [
										{ type: 'separator' as const },
										{
											label: $LL.common.actions.unterminate(),
											icon: RotateCcwIcon,
											onclick: () => {
												contract = record;
												isUnterminateDialogOpen = true;
											}
										}
									]
								: []),
							{ type: 'separator' as const },
							{
								label: $LL.common.actions.delete(),
								icon: Trash2Icon,
								variant: 'destructive' as const,
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
				<div
					class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm sm:col-span-2 xl:col-span-2"
				>
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
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.governmentId()}
					</p>
					<p class="mt-2 text-sm font-medium">
						{getDisplayGovId(record) || $LL.common.messages.unknown()}
					</p>
				</div>
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.phone()}
					</p>
					<p class="mt-2 text-sm font-medium" dir="ltr">
						{getDisplayTenantPhone(record) || $LL.common.messages.unknown()}
					</p>
				</div>
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.cycle()}
					</p>
					<p class="mt-2 text-sm font-medium">{intervalLabels[record.interval]()}</p>
				</div>
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.payment()}
					</p>
					<p class="mt-2 text-sm font-medium">
						{formatCurrency(record.cost)}
						{$LL.common.messages.sar()}
					</p>
				</div>
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.start()}
					</p>
					<p class="mt-2 text-sm font-medium">{formatDate(record.start)}</p>
				</div>
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
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
