<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/platform/database/schema';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/design/primitive/card';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tabs from '$lib/design/primitive/tabs';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { formatLocaleDate } from '$lib/platform/locale';
	import {
		canManuallyTerminateContractStatus,
		canUnterminateContractStatus,
		isContractDeletable
	} from '$lib/contract/contract';
	import {
		useDeleteContract,
		useFetchContract,
		useTerminateContract,
		useFetchContractUnits,
		useUnterminateContract
	} from '$lib/contract/query';
	import { useFetchContractPayments } from '$lib/payment/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import PaymentLedger from '$lib/payment/component/ledger.svelte';
	import { useFetchTenant } from '$lib/tenant/query';
	import BanIcon from '@lucide/svelte/icons/ban';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ContractUnits from './units.svelte';
	import BackControl from '$lib/design/block/back-control.svelte';
	import { back } from '$lib/design/back.svelte';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import ContractForm from './form.svelte';

	type ContractDetailsSection = 'overview' | 'units' | 'payments';

	let {
		contractId,
		initialSection = 'overview'
	}: {
		contractId: number;
		initialSection?: ContractDetailsSection;
	} = $props();
	// eslint-disable-next-line svelte/prefer-writable-derived
	let activeSection = $state<ContractDetailsSection>('overview');

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
	};

	const contractQuery = useFetchContract(() => contractId);
	const tenantQuery = useFetchTenant(() => ({
		id: contractQuery.data?.tenantId,
		enabled: Boolean(contractQuery.data?.tenantId)
	}));
	const deleteMutation = useDeleteContract();

	// what a deletion would be refused for, read before the question is asked rather than
	// after the destructive control is pressed.
	const heldUnitsQuery = useFetchContractUnits(() => contractId);
	const heldPaymentsQuery = useFetchContractPayments(() => contractId);
	const deletionBlockers = $derived.by(() => {
		if (heldUnitsQuery.isPending || heldPaymentsQuery.isPending) return AWAITING_BLOCKERS;

		const units = heldUnitsQuery.data ?? [];
		const payments = heldPaymentsQuery.data ?? [];

		if (isContractDeletable(units, payments)) return [];

		return [
			units.length ? $LL.common.deleteDialog.blockedUnits({ count: units.length }) : null,
			payments.length ? $LL.common.deleteDialog.blockedPayments({ count: payments.length }) : null
		].filter((blocker) => blocker !== null);
	});
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	type ContractFormValue = Omit<NonNullable<typeof contractQuery.data>, 'id'> & { id?: number };

	let formOpensOn = $state<ContractFormValue | undefined>(undefined);
	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);
	let isDeleteDialogOpen = $state(false);
	let isTerminateDialogOpen = $state(false);
	let isUnterminateDialogOpen = $state(false);

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

	const tabsListClass = 'grid h-auto w-full grid-cols-3';
	const tabsTriggerClass = 'capitalize';

	let tenantLabel = $derived.by(() => {
		const contract = contractQuery.data;

		if (!contract) {
			return $LL.common.messages.unknown();
		}

		return tenantQuery.data?.name?.trim() || $LL.common.labels.tenant();
	});

	async function deleteContract() {
		if (!contractQuery.data) return;

		await deleteMutation.mutateAsync(contractQuery.data.id);
		// the record is gone, so the screen showing it is no longer somewhere back can return
		// to — whatever was open before it is.
		back.forgetCurrent();

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

	const getSectionHref = (section: ContractDetailsSection) =>
		resolve(`/contracts/${contractId}${section === 'overview' ? '' : `?section=${section}`}`);

	$effect(() => {
		activeSection = initialSection;
	});

	$effect(() => {
		if (activeSection === initialSection) {
			return;
		}

		void goto(getSectionHref(activeSection), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});
</script>

{#if contractQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-6">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
		</div>
	</div>
{:else if !contractQuery.data}
	<Card>
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const contract = contractQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-3 pb-8 sm:pb-12">
		<div class="rounded-2xl border bg-muted p-4">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<BackControl fallback={resolve('/contracts')} />

				<div class="flex flex-wrap items-center justify-end gap-2">
					<RecordActions
						details={[
							{ label: $LL.common.labels.tenant(), value: tenantLabel },
							{ label: $LL.common.labels.nationalId(), value: tenantQuery.data?.nationalId ?? '' },
							{ label: $LL.common.labels.phone(), value: tenantQuery.data?.phone ?? '' },
							{ label: $LL.common.labels.governmentId(), value: contract.govId ?? '' },
							{ label: $LL.common.labels.cycle(), value: intervalLabels[contract.interval]() },
							{
								label: $LL.common.labels.contractPeriod(),
								value: `${formatDate(contract.start)} — ${formatDate(contract.end)}`
							}
						]}
						onDuplicate={() => {
							// the government id is a contract's unique field, so the copy starts
							// without it rather than with a value that cannot be saved.
							formOpensOn = { ...contract, id: undefined, govId: '' };
							contractFormRenderKey += 1;
							isContractFormOpen = true;
						}}
					/>

					{#if contract.status !== 'terminated'}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label={$LL.common.actions.edit()}
										class="rounded-full bg-secondary"
										onclick={() => {
											formOpensOn = contract;
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
										class="rounded-full bg-secondary"
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

			<div class="mt-4 min-w-0 space-y-2 text-start">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.nav.contracts()}
				</p>
				<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{tenantLabel}</h1>
				<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Cell.Status status={contract.status} />
					<span class="text-border">•</span>
					<span>{formatDate(contract.start)} — {formatDate(contract.end)}</span>
				</div>
			</div>
		</div>

		<Tabs.Root bind:value={activeSection} class="min-h-0 flex-1 gap-3">
			<Tabs.List class={tabsListClass}>
				<Tabs.Trigger value="overview" class={tabsTriggerClass}>
					{$LL.common.labels.information()}
				</Tabs.Trigger>
				<Tabs.Trigger value="units" class={tabsTriggerClass}>
					{$LL.common.nav.units()}
				</Tabs.Trigger>
				<Tabs.Trigger value="payments" class={tabsTriggerClass}>
					{$LL.common.nav.payments()}
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="overview" class="space-y-3 pb-1">
				<Card class="gap-0 overflow-hidden">
					<CardHeader class="gap-2 border-b pb-4">
						<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
					</CardHeader>
					<CardContent class="py-4">
						<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:text-start">
							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.tenant()}
								</p>
								<p class="mt-3 truncate text-sm font-medium">{tenantLabel}</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.nationalId()}
								</p>
								<p class="mt-3 text-sm font-medium">
									{tenantQuery.data?.nationalId || $LL.common.messages.unknown()}
								</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.phone()}
								</p>
								<p
									class="mt-3 text-start text-sm font-medium"
									dir={localesMetadata[$locale].direction}
								>
									{tenantQuery.data?.phone || $LL.common.messages.unknown()}
								</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.governmentId()}
								</p>
								<p class="mt-3 text-sm font-medium">
									{contract.govId || $LL.common.messages.unknown()}
								</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.cycle()}
								</p>
								<p class="mt-3 text-sm font-medium">{intervalLabels[contract.interval]()}</p>
							</div>

							<div class="rounded-xl border bg-muted p-4">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.contractPeriod()}
								</p>
								<p class="mt-3 text-sm font-medium">
									{formatDate(contract.start)} — {formatDate(contract.end)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</Tabs.Content>

			<Tabs.Content value="units" class="min-h-0 flex-1 pt-1">
				<ContractUnits {contractId} />
			</Tabs.Content>

			<Tabs.Content value="payments" class="min-h-0 flex-1 pt-1">
				<PaymentLedger {contractId} />
			</Tabs.Content>
		</Tabs.Root>
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
			value={formOpensOn}
		/>
	{/key}

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		record={contract.govId?.trim() || tenantLabel}
		blockers={deletionBlockers}
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
