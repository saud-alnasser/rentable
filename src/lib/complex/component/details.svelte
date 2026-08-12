<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordSurface from '$lib/design/block/record-surface.svelte';
	import Specification from '$lib/design/block/specification.svelte';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { back } from '$lib/design/back.svelte';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import ComplexesTableUnitsCount from '$lib/complex/component/unit-count.svelte';
	import { useDeleteComplex, useFetchComplex } from '$lib/complex/query';
	import { useFetchUnits } from '$lib/complex/query';
	import { isComplexDeletable } from '$lib/complex/complex';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ComplexForm from './form.svelte';
	import UnitDirectory from './unit-directory.svelte';

	let { complexId }: { complexId: number } = $props();

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
						formOpensOn = complex;
						isComplexFormOpen = true;
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

	<!-- deleting rests as quietly as any other control here and turns red on the intent to press
	     it; it is primary only inside the confirmation it opens (_Semantics are secondary_). -->
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon-sm"
					aria-label={$LL.common.actions.delete()}
					class="rounded-full bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
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
{/snippet}

{#snippet unitCount()}
	<ComplexesTableUnitsCount {complexId} class="h-auto w-auto" />
{/snippet}

<!-- location is read in the title area, so it is not read again here — the same division the
     tenant record makes with its phone number. -->
{#snippet fields()}
	<Specification entries={[{ label: $LL.common.labels.units(), value: unitCount }]} />
{/snippet}

{#snippet units()}
	<UnitDirectory {complexId} />
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
