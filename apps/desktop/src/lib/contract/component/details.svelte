<script lang="ts">
	import type { ContractSection } from '$lib/contract/section';
	import RecordHistory from '$lib/history/component/record-history.svelte';
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/platform/database/schema';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { formatRecordDateRange } from '$lib/design/date';
	import { contractActs } from '$lib/contract/host.svelte';
	import { useFetchContract } from '$lib/contract/query';
	import { toPageActions } from '$lib/design/acts';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import PaymentLedger from '$lib/payment/component/ledger.svelte';
	import { useFetchTenant } from '$lib/tenant/query';
	import { memberPermissions } from '$lib/workspace/permission';
	import ContractSchedule from './schedule.svelte';
	import ContractUnits from './units.svelte';

	let {
		contractId,
		section
	}: {
		contractId: string;
		/** the section the address names. */
		section?: ContractSection;
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

	const tenantLabel = $derived.by(() => {
		if (!contract) return $LL.common.messages.unknown();

		return tenantQuery.data?.name?.trim() || $LL.common.labels.tenant();
	});
	const period = $derived(
		contract ? formatRecordDateRange($locale, contract.start, contract.end) : ''
	);

	// the contract as its acts are given it: with its tenant's name, which is what the confirmation
	// names it by where it has no government id, the way the card names it.
	const actedOn = $derived(
		contract ? { ...contract, tenantName: tenantQuery.data?.name ?? undefined } : undefined
	);

	// the page's cluster is a projection of the one list the card and the command menu read, so it
	// offers what they offer, in their order and under their names. What each act opens is the
	// contract host's, mounted once in the frame, so this page mounts no form and no dialog.
	const pageActions = $derived(actedOn ? toPageActions(contractActs, actedOn, $LL) : []);
</script>

{#snippet identity()}
	{#if contract}
		<Cell.Status status={contract.status} />
		<span class="text-border">•</span>
		<span>{period}</span>
	{/if}
{/snippet}

{#snippet actions()}
	{#each pageActions as act (act.id)}
		<RecordActionControl
			label={act.label}
			icon={act.icon}
			tone={act.tone}
			shortcut={act.shortcut}
			unavailable={act.unavailable}
			onclick={act.run}
		/>
	{/each}
{/snippet}

<!-- the cell holds a number at `ltr`, so only a number goes through it: the stand-in is the
     reader's word and takes the reader's direction. -->
{#snippet phone()}
	{#if tenantQuery.data?.phone}
		<Cell.Phone phone={tenantQuery.data.phone} />
	{:else}
		{$LL.common.messages.unknown()}
	{/if}
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

{#snippet schedule()}
	<ContractSchedule {contractId} />
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
	{section}
	collections={[
		...(memberPermissions.views('payment')
			? [{ value: 'payments', label: $LL.common.nav.payments(), content: payments }]
			: []),
		{ value: 'schedule', label: $LL.contracts.schedule.title(), content: schedule },
		...(memberPermissions.views('unit')
			? [{ value: 'units', label: $LL.common.nav.units(), content: units }]
			: []),
		{ value: 'history', label: $LL.common.history.title(), content: history }
	]}
/>
