<script lang="ts">
	import { resolve } from '$app/paths';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import { useFetchUnit } from '$lib/complex/query';
	import { unitActs } from '$lib/complex/unit/host.svelte';
	import { toPageActions } from '$lib/design/acts';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { memberPermissions } from '$lib/workspace/permission';
	import UnitContracts from './contracts.svelte';

	let { unitId }: { unitId: string } = $props();

	const unitQuery = useFetchUnit(() => unitId);
	const unit = $derived(unitQuery.data);

	// the page's cluster is a projection of the one list the unit's card and the command menu read,
	// so it offers what the card offers, edit and delete included. What each act opens is the unit
	// host's, mounted once in the frame, so this page mounts no form and no dialog.
	const pageActions = $derived(unit ? toPageActions(unitActs, unit, $LL) : []);

	// the complex the unit is reached through, named as the complex's own page names it, so the
	// trail's crumb and the page it opens say the same thing.
	const parent = $derived(
		unit
			? {
					name: unit.complexName?.trim() || $LL.common.labels.complex(),
					href: resolve(`/complexes/${unit.complexId}`)
				}
			: undefined
	);
</script>

<!-- read in the field list and nowhere else. It used to render here and again under the name
     from this one value, so the two could never disagree and one of them was doing no work. -->
{#snippet status()}
	{#if unit}
		<Cell.Status status={unit.status} />
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
	{parent}
	{actions}
	{fields}
	collections={memberPermissions.views('contract')
		? [{ value: 'contracts', label: $LL.common.nav.contracts(), content: contracts }]
		: []}
/>
