<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { back } from '@rentable/design/back.svelte.js';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import { useDeleteComplex, useFetchComplex } from '$lib/complex/query';
	import { useFetchUnits } from '$lib/complex/query';
	import { useListContracts } from '$lib/contract/query';
	import { isComplexDeletable } from '$lib/complex/complex';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ComplexForm from './form.svelte';
	import UnitDirectory from './unit-directory.svelte';

	let { complexId }: { complexId: string } = $props();

	const complexQuery = useFetchComplex(() => complexId);
	const complex = $derived(complexQuery.data);
	const deleteMutation = useDeleteComplex();

	// what a deletion would be refused for, read before the question is asked rather than
	// after the destructive control is pressed.
	const heldUnitsQuery = useFetchUnits(() => complexId);
	const complexBlockers = $derived.by(() => {
		if (heldUnitsQuery.isPending) return AWAITING_BLOCKERS;

		const held = heldUnitsQuery.data ?? [];

		return isComplexDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedUnits({ count: held.length })];
	});

	// the units this complex holds, read once and answering two questions: what a deletion is
	// refused for, and what the field list states.
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

	let formOpensOn = $state<NonNullable<typeof complexQuery.data> | undefined>(undefined);
	let isComplexFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	async function deleteComplex() {
		if (!complex) return;

		await deleteMutation.mutateAsync(complex.id);
		// the record is gone, so the screen showing it is no longer somewhere back can return
		// to — whatever was open before it is.
		back.forgetCurrent();

		await goto(resolve('/complexes'));
	}
</script>

{#snippet identity()}
	<span>{complex?.location}</span>
{/snippet}

{#snippet actions()}
	<RecordActions
		details={[
			{ label: $LL.common.labels.name(), value: complex?.name ?? '' },
			{ label: $LL.common.labels.location(), value: complex?.location ?? '' }
		]}
	/>

	<RecordActionControl
		label={$LL.common.actions.edit()}
		icon={SquarePenIcon}
		onclick={() => {
			formOpensOn = complex;
			isComplexFormOpen = true;
		}}
	/>

	<RecordActionControl
		label={$LL.common.actions.delete()}
		icon={Trash2Icon}
		tone="error"
		onclick={() => (isDeleteDialogOpen = true)}
	/>
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

{#if complex}
	<ComplexForm
		open={isComplexFormOpen}
		onOpenChange={(isOpen) => {
			isComplexFormOpen = isOpen;
		}}
		value={formOpensOn}
	/>

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		record={complex.name}
		blockers={complexBlockers}
		onSubmit={deleteComplex}
	/>
{/if}
