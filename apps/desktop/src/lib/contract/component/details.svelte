<script lang="ts" module>
	/** Which of the contract's two collections the address arrived on. */
	export type ContractCollection = 'payments' | 'units';
</script>

<script lang="ts">
	import RecordHistory from '$lib/history/component/record-history.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/platform/database/schema';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordSurface from '$lib/design/block/record-surface.svelte';
	import Specification from '$lib/design/block/specification.svelte';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '$lib/design/block/record-action-control.svelte';
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
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ContractUnits from './units.svelte';
	import { back } from '$lib/design/back.svelte';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import ContractForm from './form.svelte';

	let {
		contractId,
		initialCollection
	}: {
		contractId: string;
		initialCollection?: ContractCollection;
	} = $props();

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
	};

	const contractQuery = useFetchContract(() => contractId);
	const contract = $derived(contractQuery.data);
	const tenantQuery = useFetchTenant(() => ({
		id: contract?.tenantId,
		enabled: Boolean(contract?.tenantId)
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

	type ContractFormValue = Omit<NonNullable<typeof contractQuery.data>, 'id'> & { id?: string };

	let formOpensOn = $state<ContractFormValue | undefined>(undefined);
	// set when the form was opened to renew this contract rather than to edit or copy it.
	let renewingContractId = $state<string | undefined>(undefined);
	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);
	let isDeleteDialogOpen = $state(false);
	let isTerminateDialogOpen = $state(false);
	let isUnterminateDialogOpen = $state(false);

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

	const openContractForm = (value: ContractFormValue | undefined) => {
		formOpensOn = value;
		renewingContractId = undefined;
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	const openRenewal = (id: string) => {
		formOpensOn = undefined;
		renewingContractId = id;
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	const tenantLabel = $derived.by(() => {
		if (!contract) return $LL.common.messages.unknown();

		return tenantQuery.data?.name?.trim() || $LL.common.labels.tenant();
	});
	const period = $derived(
		contract ? `${formatDate(contract.start)} — ${formatDate(contract.end)}` : ''
	);

	async function deleteContract() {
		if (!contract) return;

		await deleteMutation.mutateAsync(contract.id);
		// the record is gone, so the screen showing it is no longer somewhere back can return
		// to — whatever was open before it is.
		back.forgetCurrent();

		await goto(resolve('/contracts'));
	}

	async function terminateContract() {
		if (!contract) return;

		await terminateMutation.mutateAsync(contract.id);
	}

	async function unterminateContract() {
		if (!contract) return;

		await unterminateMutation.mutateAsync(contract.id);
	}
</script>

{#snippet identity()}
	{#if contract}
		<Cell.Status status={contract.status} />
		<span class="text-border">•</span>
		<span>{period}</span>
	{/if}
{/snippet}

{#snippet actions()}
	<RecordActions
		details={[
			{ label: $LL.common.labels.tenant(), value: tenantLabel },
			{ label: $LL.common.labels.nationalId(), value: tenantQuery.data?.nationalId ?? '' },
			{ label: $LL.common.labels.phone(), value: tenantQuery.data?.phone ?? '' },
			{ label: $LL.common.labels.governmentId(), value: contract?.govId ?? '' },
			{
				label: $LL.common.labels.cycle(),
				value: contract ? intervalLabels[contract.interval]() : ''
			},
			{ label: $LL.common.labels.contractPeriod(), value: period }
		]}
		onDuplicate={contract
			? () => {
					// the government id is a contract's unique field, so the copy starts without it
					// rather than with a value that cannot be saved.
					openContractForm({ ...contract, id: undefined, govId: '' });
				}
			: undefined}
	/>

	{#if contract}
		<!-- renewal continues the term rather than copying it, so it sits beside the copy the
		     action cluster already offers and never replaces it. -->
		<RecordActionControl
			label={$LL.common.actions.renew()}
			icon={CalendarPlusIcon}
			onclick={() => openRenewal(contract.id)}
		/>
	{/if}

	{#if contract && contract.status !== 'terminated'}
		<RecordActionControl
			label={$LL.common.actions.edit()}
			icon={SquarePenIcon}
			onclick={() => openContractForm(contract)}
		/>
	{/if}

	{#if contract && canManuallyTerminateContractStatus(contract.status)}
		<RecordActionControl
			label={$LL.common.actions.terminate()}
			icon={BanIcon}
			tone="error"
			onclick={() => (isTerminateDialogOpen = true)}
		/>
	{/if}

	{#if contract && canUnterminateContractStatus(contract.status)}
		<!-- un-terminating puts a contract back rather than taking it away, so it rests neutral
		     beside the two that do not. -->
		<RecordActionControl
			label={$LL.common.actions.unterminate()}
			icon={RotateCcwIcon}
			onclick={() => (isUnterminateDialogOpen = true)}
		/>
	{/if}

	<RecordActionControl
		label={$LL.common.actions.delete()}
		icon={Trash2Icon}
		tone="error"
		onclick={() => (isDeleteDialogOpen = true)}
	/>
{/snippet}

{#snippet phone()}
	<span dir={localesMetadata[$locale].direction}>
		{tenantQuery.data?.phone || $LL.common.messages.unknown()}
	</span>
{/snippet}

{#snippet fields()}
	<Specification
		entries={[
			{
				label: $LL.common.labels.nationalId(),
				value: tenantQuery.data?.nationalId || $LL.common.messages.unknown()
			},
			{ label: $LL.common.labels.phone(), value: phone },
			{
				label: $LL.common.labels.governmentId(),
				value: contract?.govId || $LL.common.messages.unknown()
			},
			{
				label: $LL.common.labels.cycle(),
				value: contract ? intervalLabels[contract.interval]() : ''
			}
		]}
	/>
{/snippet}

{#snippet payments()}
	<PaymentLedger {contractId} />
{/snippet}

{#snippet units()}
	<ContractUnits {contractId} />
{/snippet}

<!-- payments leads: a contract exists to be paid, and the units collection is a writing
     surface with two search panes, which is not where a reader should land. -->
{#snippet history()}
	<RecordHistory concept="contract" recordId={contractId} />
{/snippet}

<RecordSurface
	isLoading={contractQuery.isLoading}
	found={Boolean(contract)}
	backFallback={resolve('/contracts')}
	path={resolve(`/contracts/${contractId}`)}
	eyebrow={$LL.common.nav.contracts()}
	title={tenantLabel}
	{identity}
	{actions}
	{fields}
	{initialCollection}
	collections={[
		{ value: 'payments', label: $LL.common.nav.payments(), content: payments },
		{ value: 'units', label: $LL.common.nav.units(), content: units },
		{ value: 'history', label: $LL.common.history.title(), content: history }
	]}
/>

{#if contract}
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
			renewsContractId={renewingContractId}
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
