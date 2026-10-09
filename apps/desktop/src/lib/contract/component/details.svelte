<script lang="ts">
	import type { ContractSection } from '$lib/contract/section';
	import type { Section } from '$lib/feature/surface';
	import { resolve } from '$app/paths';
	import { toReadFailure } from '$lib/error/read';
	import type { Contract } from '$lib/platform/database/schema';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { formatRecordDateRange } from '$lib/date';
	import { contractActs } from '$lib/contract/host.svelte';
	import { useFetchContract } from '$lib/contract/query';
	import { toPageActions } from '$lib/act';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { UNIT_KIND } from '$lib/complex';
	import { useFetchTenant } from '$lib/tenant/ui';
	import { memberPermissions } from '$lib/permission';
	import ContractSchedule from '$lib/contract/schedule/component/schedule.svelte';
	import ContractUnits from '$lib/contract/assignment/component/units.svelte';

	let {
		contractId,
		section,
		sections = []
	}: {
		contractId: string;
		/** the section the address names. */
		section?: ContractSection;
		/** what is contributed to a contract's page, handed over by the route. */
		sections?: Section<'contract'>[];
	} = $props();

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
	};

	const contractQuery = useFetchContract(() => contractId);
	const contract = $derived(contractQuery.data);
	// whether the read behind the page failed, as `$lib/error/read` decides it, and what runs it
	// again: the surface draws the failed state in place of *not found* while it did.
	const contractRead = $derived(toReadFailure(contractQuery));
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

	// the contract's own collections, placed by `order` among what is contributed to its page: the
	// payments lead, because a contract exists to be paid and the units collection is a writing
	// surface with two search panes, which is not where a reader should land; the schedule follows
	// them, then the units, then the history. A section the reader may not see is left out whole.
	const collections = $derived(
		[
			...sections
				.filter((contribution) => contribution.shows?.() ?? true)
				.map((contribution) => ({
					order: contribution.order,
					value: contribution.value,
					label: contribution.label($LL),
					content: contributed
				})),
			{ order: 20, value: 'schedule', label: $LL.contracts.schedule.title(), content: schedule },
			...(memberPermissions.views(UNIT_KIND)
				? [{ order: 30, value: 'units', label: $LL.common.nav.units(), content: units }]
				: [])
		].sort((a, b) => a.order - b.order)
	);
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

{#snippet contributed(value: string)}
	{@const contribution = sections.find((entry) => entry.value === value)}
	{#if contribution}
		<contribution.component kind="contract" recordId={contractId} />
	{/if}
{/snippet}

{#snippet schedule()}
	<ContractSchedule {contractId} />
{/snippet}

{#snippet units()}
	<ContractUnits {contractId} />
{/snippet}

<RecordSurface
	isLoading={contractQuery.isLoading}
	failed={contractRead.failed}
	onRetry={contractRead.retry}
	retrying={contractRead.retrying}
	found={Boolean(contract)}
	backFallback={resolve('/contracts')}
	path={resolve(`/contracts/${contractId}`)}
	eyebrow={$LL.common.nav.contracts()}
	title={tenantLabel}
	{identity}
	{actions}
	{fields}
	{section}
	{collections}
/>
