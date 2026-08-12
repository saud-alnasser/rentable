<script lang="ts">
	import { resolve } from '$app/paths';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import RecordSurface from '$lib/design/block/record-surface.svelte';
	import Specification from '$lib/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import { useFetchUnit } from '$lib/complex/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import UnitContracts from './unit-contracts.svelte';

	let { unitId }: { unitId: number } = $props();

	const unitQuery = useFetchUnit(() => unitId);
	const unit = $derived(unitQuery.data);
</script>

{#snippet status()}
	{#if unit}
		<Cell.Status status={unit.status} />
	{/if}
{/snippet}

{#snippet actions()}
	<!-- a unit is created and edited from the complex holding it, so there is no form here to
	     duplicate into. -->
	<RecordActions
		details={[
			{ label: $LL.common.labels.name(), value: unit?.name ?? '' },
			{ label: $LL.common.labels.complex(), value: unit?.complexName ?? '' },
			{
				label: $LL.common.labels.status(),
				value: unit ? $LL.common.status[unit.status]() : ''
			}
		]}
	/>
{/snippet}

{#snippet fields()}
	<Specification
		entries={[
			{ label: $LL.common.labels.complex(), value: unit?.complexName ?? '' },
			{ label: $LL.common.labels.status(), value: status }
		]}
	/>
{/snippet}

{#snippet contracts()}
	<UnitContracts {unitId} />
{/snippet}

<RecordSurface
	isLoading={unitQuery.isLoading}
	found={Boolean(unit)}
	backFallback={unit ? resolve(`/complexes/${unit.complexId}`) : resolve('/complexes')}
	path={resolve(`/complexes/units/${unitId}`)}
	eyebrow={unit?.complexName ?? ''}
	title={unit?.name ?? ''}
	identity={status}
	{actions}
	{fields}
	collections={[{ value: 'contracts', label: $LL.common.nav.contracts(), content: contracts }]}
/>
