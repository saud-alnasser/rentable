<script lang="ts">
	import { resolve } from '$app/paths';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { complexActs } from '$lib/complex/host.svelte';
	import { useFetchComplex, useFetchUnits } from '$lib/complex/query';
	import { useListContracts } from '$lib/contract/query';
	import { toPageActions } from '$lib/design/acts';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import UnitDirectory from './unit-directory.svelte';

	let { complexId }: { complexId: string } = $props();

	const complexQuery = useFetchComplex(() => complexId);
	const complex = $derived(complexQuery.data);
	// the units this complex holds, and what the field list states of them.
	const heldUnitsQuery = useFetchUnits(() => complexId);
	const unitFigures = $derived.by(() => {
		const held = heldUnitsQuery.data;

		if (!held) return undefined;

		const vacant = held.filter((unit) => unit.status === 'vacant').length;

		return { total: held.length, vacant, occupied: held.length - vacant };
	});

	// narrowed to this complex in the procedure. Loading every contract to keep this building's
	// would be the client-side narrowing ADR 0010 refuses.
	const complexContractsQuery = useListContracts(
		() => '',
		() => null,
		() => ({ complexId })
	);
	const activeContractCount = $derived(
		complexContractsQuery.data?.filter((contract) => contract.status === 'active').length
	);

	// a figure the reader can trust or nothing at all: a zero shown while its query is still in
	// flight is a wrong answer rather than an incomplete one.
	const figure = (count: number | undefined) =>
		count === undefined ? '' : formatLocaleNumber($locale, count);

	// the page's cluster is a projection of the one list the card and the command menu read, so it
	// offers what they offer, in their order and under their names. What each act opens is the
	// complex host's, mounted once in the frame, so this page mounts no form and no dialog.
	const pageActions = $derived(complex ? toPageActions(complexActs, complex, $LL) : []);
</script>

{#snippet identity()}
	<span>{complex?.location}</span>
{/snippet}

{#snippet actions()}
	{#each pageActions as act (act.id)}
		<RecordActionControl
			label={act.label}
			icon={act.icon}
			tone={act.tone}
			shortcut={act.shortcut}
			disabled={act.unavailable !== undefined}
			onclick={act.run}
		/>
	{/each}
{/snippet}

<!-- location is read in the title area, so it is not read again here. Everything else the
     record knows about itself is stated: how many spaces it holds, how they divide, and how
     much runs against them today. -->
{#snippet fields()}
	<Specification
		entries={[
			{ label: $LL.common.labels.units(), value: figure(unitFigures?.total) },
			{ label: $LL.common.labels.occupiedUnits(), value: figure(unitFigures?.occupied) },
			{ label: $LL.common.labels.vacantUnits(), value: figure(unitFigures?.vacant) },
			{ label: $LL.common.labels.activeContracts(), value: figure(activeContractCount) }
		]}
	/>
{/snippet}

{#snippet units()}
	<UnitDirectory {complexId} complexName={complex?.name ?? ''} />
{/snippet}

<RecordSurface
	isLoading={complexQuery.isLoading}
	found={Boolean(complex)}
	backFallback={resolve('/complexes')}
	path={resolve(`/complexes/${complexId}`)}
	eyebrow={$LL.common.nav.complexes()}
	title={complex?.name ?? ''}
	{identity}
	{actions}
	{fields}
	collections={[{ value: 'units', label: $LL.common.nav.units(), content: units }]}
/>
