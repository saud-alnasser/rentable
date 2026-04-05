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
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import * as Tabs from '$lib/common/components/fragments/tabs';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import {
		useDeleteContract,
		useFetchContract,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/resources/contracts/hooks/queries';
	import { useFetchTenant } from '$lib/resources/tenants/hooks/queries';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BanIcon from '@lucide/svelte/icons/ban';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ContractForm from './contract-form.svelte';
	import ContractPaymentsDataView from './contract-payments-data-view.svelte';
	import ContractUnitsManagement from './contract-units-management.svelte';

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

	const tabsListClass =
		'grid h-auto w-full grid-cols-3 rounded-[1.3rem] border border-border/70 bg-card/55 p-0.5 shadow-lg backdrop-blur-xl';
	const tabsTriggerClass =
		'capitalize rounded-[1rem] px-3 py-2 text-sm font-medium data-[state=active]:border-border/50 data-[state=active]:bg-background/80 data-[state=active]:text-foreground data-[state=active]:shadow-sm';

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

		// eslint-disable-next-line svelte/no-navigation-without-resolve
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
	<Card class="border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const contract = contractQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-3 pb-8 sm:pb-12">
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

			<div class="mt-4 min-w-0 space-y-2 text-start">
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
				<Card class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
					<CardHeader class="gap-2 border-b pb-4">
						<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
					</CardHeader>
					<CardContent class="py-4">
						<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:text-start">
							<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.tenant()}
								</p>
								<p class="mt-3 truncate text-sm font-medium">{tenantLabel}</p>
							</div>

							<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
								<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
									{$LL.common.labels.nationalId()}
								</p>
								<p class="mt-3 text-sm font-medium">
									{tenantQuery.data?.nationalId || $LL.common.messages.unknown()}
								</p>
							</div>

							<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
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
				<ContractUnitsManagement {contractId} showHeader={false} />
			</Tabs.Content>

			<Tabs.Content value="payments" class="min-h-0 flex-1 pt-1">
				<ContractPaymentsDataView {contractId} showHeader={false} />
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
