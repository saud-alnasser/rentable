<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/api/database/schema';
	import {
		canManuallyTerminateContractStatus,
		canUnterminateContractStatus
	} from '$lib/api/utils/contract-status';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Progress } from '$lib/common/components/fragments/progress';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import {
		formatLocaleDate,
		formatLocaleNumber,
		formatLocaleRangeWithUnit,
		formatLocaleValueWithUnit
	} from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import {
		useDeleteContract,
		useFetchContract,
		useFetchContractPayments,
		useFetchContractUnits,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/resources/contracts/hooks/queries';
	import { useFetchTenant } from '$lib/resources/tenants/hooks/queries';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BanIcon from '@lucide/svelte/icons/ban';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import ContractForm from './contract-form.svelte';

	let { contractId }: { contractId: number } = $props();

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

	const contractQuery = useFetchContract(() => contractId);
	const tenantQuery = useFetchTenant(() => ({
		id: contractQuery.data?.tenantId,
		enabled: Boolean(contractQuery.data?.tenantId)
	}));
	const unitsQuery = useFetchContractUnits(() => contractId);
	const paymentsQuery = useFetchContractPayments(() => contractId);
	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);
	let isDeleteDialogOpen = $state(false);
	let isTerminateDialogOpen = $state(false);
	let isUnterminateDialogOpen = $state(false);

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

	const formatCurrency = (value: number) => formatLocaleNumber($locale, value);
	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
	const formatMoneyRange = (start: number, end: number) =>
		formatLocaleRangeWithUnit($locale, start, end, $LL.common.messages.sar());

	let tenantLabel = $derived.by(() => {
		const contract = contractQuery.data;

		if (!contract) {
			return $LL.common.messages.unknown();
		}

		return (
			tenantQuery.data?.name ??
			$LL.contracts.table.tenantFallback({ tenantId: String(contract.tenantId) })
		);
	});

	let paymentProgress = $derived.by(() => {
		const contract = contractQuery.data;

		if (!contract) {
			return {
				paidAmount: 0,
				expectedAmount: 0,
				progressValue: 0,
				progressPercent: 0,
				remainingAmount: 0
			};
		}

		const paidAmount = contract.paidAmount ?? 0;
		const expectedAmount = contract.expectedAmount ?? 0;
		const progressValue = expectedAmount > 0 ? Math.min(paidAmount, expectedAmount) : 0;
		const progressPercent =
			expectedAmount > 0 ? Math.min((paidAmount / expectedAmount) * 100, 100) : 0;
		const remainingAmount = Math.max(expectedAmount - paidAmount, 0);

		return { paidAmount, expectedAmount, progressValue, progressPercent, remainingAmount };
	});

	async function deleteContract() {
		if (!contractQuery.data) return;

		await deleteMutation.mutateAsync(contractQuery.data.id);
		await goto(resolve('/contracts'));
	}

	async function terminateContract() {
		if (!contractQuery.data) return;

		await terminateMutation.mutateAsync(contractQuery.data.id);
	}

	async function unterminateContract() {
		if (!contractQuery.data) return;

		await unterminateMutation.mutateAsync(contractQuery.data.id);
	}
</script>

{#if contractQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-6">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
		</div>
	</div>
{:else if !contractQuery.data}
	<Card class="border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
			<CardDescription>#{contractId}</CardDescription>
		</CardHeader>
	</Card>
{:else}
	{@const contract = contractQuery.data}
	<div class="flex flex-col gap-4 pb-10 sm:pb-16">
		<div class="rounded-[1.5rem] border border-border/70 bg-card/65 p-4 shadow-xl backdrop-blur-xl">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								href={resolve('/contracts')}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.ui.previous()}
								class="shrink-0 rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
							>
								<ArrowLeftIcon class="size-4 rtl:rotate-180" />
								<span class="sr-only">{$LL.common.ui.previous()}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>
						{$LL.common.ui.previous()}
					</Tooltip.Content>
				</Tooltip.Root>

				<div class="flex flex-wrap items-center justify-end gap-2">
					{#if contract.status !== 'terminated'}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label={$LL.common.actions.edit()}
										class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
										onclick={() => {
											contractFormRenderKey += 1;
											isContractFormOpen = true;
										}}
									>
										<SquarePenIcon class="size-4" />
										<span class="sr-only">{$LL.common.actions.edit()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>
								{$LL.common.actions.edit()}
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}

					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									href={resolve(`/contracts/units/${contract.id}`)}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.contracts.table.unitsManagement()}
									class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
								>
									<Building2Icon class="size-4" />
									<span class="sr-only">{$LL.contracts.table.unitsManagement()}</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8}>
							{$LL.contracts.table.unitsManagement()}
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									href={resolve(`/contracts/payments/${contract.id}`)}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.contracts.table.paymentsManagement()}
									class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
								>
									<WalletIcon class="size-4" />
									<span class="sr-only">{$LL.contracts.table.paymentsManagement()}</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8}>
							{$LL.contracts.table.paymentsManagement()}
						</Tooltip.Content>
					</Tooltip.Root>

					{#if canManuallyTerminateContractStatus(contract.status)}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="destructive"
										size="icon-sm"
										aria-label={$LL.common.actions.terminate()}
										class="rounded-full"
										onclick={() => (isTerminateDialogOpen = true)}
									>
										<BanIcon class="size-4" />
										<span class="sr-only">{$LL.common.actions.terminate()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>
								{$LL.common.actions.terminate()}
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}

					{#if canUnterminateContractStatus(contract.status)}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label={$LL.common.actions.unterminate()}
										class="rounded-full border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
										onclick={() => (isUnterminateDialogOpen = true)}
									>
										<RotateCcwIcon class="size-4" />
										<span class="sr-only">{$LL.common.actions.unterminate()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>
								{$LL.common.actions.unterminate()}
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}

					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="destructive"
									size="icon-sm"
									aria-label={$LL.common.actions.delete()}
									class="rounded-full"
									onclick={() => (isDeleteDialogOpen = true)}
								>
									<Trash2Icon class="size-4" />
									<span class="sr-only">{$LL.common.actions.delete()}</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8}>
							{$LL.common.actions.delete()}
						</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>

			<div class="mt-5 min-w-0 space-y-2 text-start">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.nav.contracts()}
				</p>
				<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{tenantLabel}</h1>
				<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<span {...props} class="inline-flex">
									<Badge variant={statusVariants[contract.status]} class="capitalize">
										{$LL.common.status[contract.status]()}
									</Badge>
								</span>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content class="max-w-60" side="top">
							{statusDescriptions[contract.status]()}
						</Tooltip.Content>
					</Tooltip.Root>
					<span class="text-border">•</span>
					<span>{formatDate(contract.start)} — {formatDate(contract.end)}</span>
				</div>
			</div>
		</div>

		<Card class="border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
			<CardHeader class="gap-3 border-b pb-4">
				<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
			</CardHeader>
			<CardContent class="pt-4">
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:text-start">
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.tenant()}
						</p>
						<p class="mt-3 text-lg font-semibold">{tenantLabel}</p>
					</div>

					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.phone()}
						</p>
						<p class="mt-3 text-start text-sm font-medium" dir={localesMetadata[$locale].direction}>
							{tenantQuery.data?.phone || $LL.common.messages.unknown()}
						</p>
					</div>

					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.governmentId()}
						</p>
						<p class="mt-3 text-sm font-medium">
							{contract.govId || $LL.common.messages.unknown()}
						</p>
					</div>

					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.cycle()}
						</p>
						<p class="mt-3 text-sm font-medium">{intervalLabels[contract.interval]()}</p>
					</div>

					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.start()}
						</p>
						<p class="mt-3 text-sm font-medium">{formatDate(contract.start)}</p>
					</div>

					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.end()}
						</p>
						<p class="mt-3 text-sm font-medium">{formatDate(contract.end)}</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
			<CardHeader class="gap-4 border-b pb-4">
				<CardTitle class="capitalize">{$LL.common.labels.paymentFulfillment()}</CardTitle>
			</CardHeader>

			<CardContent class="space-y-4 pt-4">
				<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
					<div class="flex items-center justify-between gap-3 text-sm rtl:flex-row-reverse">
						<div class="text-start">
							<p class="text-xs tracking-wide text-muted-foreground uppercase">
								{$LL.common.labels.paymentFulfillment()}
							</p>
							<p class="mt-1 text-lg font-semibold">
								{formatMoneyRange(paymentProgress.paidAmount, paymentProgress.expectedAmount)}
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

				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:text-start">
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.payment()}
						</p>
						<p class="mt-2 text-sm font-medium">
							{formatMoney(contract.cost)}
						</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.cycle()}
						</p>
						<p class="mt-2 text-sm font-medium">{intervalLabels[contract.interval]()}</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.units()}
						</p>
						<p class="mt-2 text-2xl font-semibold">{unitsQuery.data?.length ?? 0}</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.contracts.payments.title()}
						</p>
						<p class="mt-2 text-2xl font-semibold">{paymentsQuery.data?.length ?? 0}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	{#key contractFormRenderKey}
		<ContractForm
			open={isContractFormOpen}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					contractFormRenderKey += 1;
				}

				isContractFormOpen = isOpen;
			}}
			value={contract}
		/>
	{/key}

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		onSubmit={deleteContract}
	/>

	<DeleteDialog
		open={isTerminateDialogOpen}
		onOpenChange={(isOpen) => {
			isTerminateDialogOpen = isOpen;
		}}
		title={$LL.contracts.table.terminateTitle()}
		description={$LL.contracts.table.terminateDescription()}
		confirmLabel={$LL.common.actions.terminate()}
		confirmLoadingLabel={$LL.common.actions.terminating()}
		onSubmit={terminateContract}
	/>

	<DeleteDialog
		open={isUnterminateDialogOpen}
		onOpenChange={(isOpen) => {
			isUnterminateDialogOpen = isOpen;
		}}
		title={$LL.contracts.table.restoreTitle()}
		description={$LL.contracts.table.restoreDescription()}
		confirmLabel={$LL.common.actions.unterminate()}
		confirmLoadingLabel={$LL.common.actions.restoring()}
		confirmVariant="default"
		onSubmit={unterminateContract}
	/>
{/if}
