<script lang="ts">
	import { resolve } from '$app/paths';
	import { toReadFailure } from '$lib/error/read';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import { useFetchUnit } from '$lib/complex/unit/query';
	import { unitActs } from '$lib/complex/unit/host.svelte';
	import { toPageActions } from '$lib/act';
	import type { Section } from '$lib/feature/surface';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		unitId,
		sections = []
	}: {
		unitId: string;
		/** what other features contribute to a unit's page, handed over by the route. */
		sections?: Section<'unit'>[];
	} = $props();

	const unitQuery = useFetchUnit(() => unitId);
	const unit = $derived(unitQuery.data);
	// whether the read behind the page failed, as `$lib/error/read` decides it, and what runs it
	// again: the surface draws the failed state in place of *not found* while it did.
	const unitRead = $derived(toReadFailure(unitQuery));

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

	// what hangs off a unit is what other features contribute, a section the reader may not see
	// left out whole.
	const collections = $derived(
		sections
			.filter((section) => section.shows?.() ?? true)
			.map((section) => ({ value: section.value, label: section.label($LL), content: contributed }))
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
			// the complex is left out, label and all, where the read answered without it: a reader who
			// may not view complexes is not told which one holds the unit (effort 838, requirement 10).
			...(unit?.complexName !== undefined
				? [{ label: $LL.common.labels.complex(), value: unit.complexName }]
				: []),
			{ label: $LL.common.labels.status(), value: status }
		]}
	/>
{/snippet}

{#snippet contributed(value: string)}
	{@const contribution = sections.find((section) => section.value === value)}
	{#if contribution}
		<contribution.component kind="unit" recordId={unitId} />
	{/if}
{/snippet}

<RecordSurface
	isLoading={unitQuery.isLoading}
	failed={unitRead.failed}
	onRetry={unitRead.retry}
	found={Boolean(unit)}
	backFallback={unit ? resolve(`/complexes/${unit.complexId}`) : resolve('/complexes')}
	path={resolve(`/complexes/units/${unitId}`)}
	eyebrow={unit?.complexName ?? ''}
	title={unit?.name ?? ''}
	{parent}
	{actions}
	{fields}
	{collections}
/>
