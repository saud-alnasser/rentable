<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { useFetchContract, useFetchContractUnits } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import UnitAssignmentForm from './unit-assignment-form.svelte';

	/** The contract these units are assigned to. */
	let { contractId }: { contractId: number } = $props();

	type AssignedUnit = Awaited<ReturnType<typeof api.contract.units.getMany>>[number];

	const ROW_HEIGHT = 64;

	let search = $state('');
	let isAssignmentFormOpen = $state(false);

	const contractQuery = useFetchContract(() => contractId);
	const assignedUnitsQuery = useFetchContractUnits(() => contractId);

	const units = $derived(assignedUnitsQuery.data ?? []);

	// the two rules that lock a contract's units, read from the contract rather than restated:
	// the procedure enforces them and refuses either way, so this only decides what the surface
	// offers and what it says about why.
	const isTerminated = $derived(contractQuery.data?.status === 'terminated');
	const hasRegisteredPayments = $derived((contractQuery.data?.paidAmount ?? 0) > 0);
	const isLocked = $derived(isTerminated || hasRegisteredPayments);

	const lockNotice = $derived.by(() => {
		if (isTerminated) return $LL.contracts.units.lockNoticeTerminated();
		if (hasRegisteredPayments) return $LL.contracts.units.lockNoticeHasPayments();

		return undefined;
	});
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	{#if lockNotice}
		<p
			class="shrink-0 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-start text-xs text-muted-foreground"
		>
			{lockNotice}
		</p>
	{/if}

	<List
		data={units}
		bind:search
		isLoading={assignedUnitsQuery.isLoading}
		isFetching={assignedUnitsQuery.isFetching}
		recordHeight={ROW_HEIGHT}
		emptyTitle={$LL.contracts.units.noAssignedUnits()}
		onCreate={isLocked ? undefined : () => (isAssignmentFormOpen = true)}
	>
		{#snippet record(unit: AssignedUnit)}
			<!-- removing a unit belongs to the surface that assigns them, which now expresses both
			     directions and commits once; what is left here reads. -->
			<a
				href={resolve(`/complexes/units/${unit.id}`)}
				class="flex h-full items-center gap-3 border-b px-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
					<span class="truncate text-sm font-medium">{unit.name}</span>
					<span class="truncate text-xs text-muted-foreground">{unit.complexName}</span>
				</span>

				<span class="flex shrink-0 items-center gap-3">
					<Cell.Status status={unit.status} />
				</span>
			</a>
		{/snippet}
	</List>
</div>

<UnitAssignmentForm
	{contractId}
	open={isAssignmentFormOpen}
	onOpenChange={(isOpen) => {
		isAssignmentFormOpen = isOpen;
	}}
/>
