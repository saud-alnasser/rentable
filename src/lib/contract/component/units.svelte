<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import {
		useFetchContract,
		useFetchContractUnits,
		useRemoveContractUnit
	} from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UnitAssignmentForm from './unit-assignment-form.svelte';

	/** The contract these units are assigned to. */
	let { contractId }: { contractId: number } = $props();

	type AssignedUnit = Awaited<ReturnType<typeof api.contract.units.getMany>>[number];

	const ROW_HEIGHT = 64;

	let search = $state('');
	let unitToRemove = $state<AssignedUnit | undefined>(undefined);
	let isAssignmentFormOpen = $state(false);
	let isRemoveDialogOpen = $state(false);

	const contractQuery = useFetchContract(() => contractId);
	const assignedUnitsQuery = useFetchContractUnits(() => contractId);
	const removeMutation = useRemoveContractUnit();

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
			<div
				class="relative flex h-full items-center gap-3 border-b px-4 transition-colors hover:bg-muted/40"
			>
				<!-- the link covers the row rather than wrapping it, so the remove control can sit
				     above it instead of being swallowed by its click target. -->
				<a
					href={resolve(`/complexes/units/${unit.id}`)}
					class="absolute inset-0 rounded-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					aria-label={unit.name}
				></a>

				<span class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5 text-start">
					<span class="truncate text-sm font-medium">{unit.name}</span>
					<span class="truncate text-xs text-muted-foreground">{unit.complexName}</span>
				</span>

				<span class="pointer-events-none relative flex shrink-0 items-center gap-3">
					<Cell.Status status={unit.status} />
				</span>

				{#if !isLocked}
					<div class="relative flex size-8 shrink-0 items-center justify-center">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										disabled={removeMutation.isPending}
										class="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
										aria-label={$LL.common.actions.remove()}
										onclick={() => {
											unitToRemove = unit;
											isRemoveDialogOpen = true;
										}}
									>
										<Trash2Icon class="size-4" />
										<span class="sr-only">{$LL.common.actions.remove()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>
								{$LL.common.actions.remove()}
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				{/if}
			</div>
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

<DeleteDialog
	open={isRemoveDialogOpen}
	onOpenChange={(isOpen) => {
		isRemoveDialogOpen = isOpen;
		if (!isOpen) unitToRemove = undefined;
	}}
	title={$LL.contracts.units.removeTitle()}
	description={$LL.contracts.units.removeDescription()}
	confirmLabel={$LL.common.actions.remove()}
	onSubmit={async () => {
		if (unitToRemove) {
			await removeMutation.mutateAsync({ contractId, unitId: unitToRemove.id });
		}
	}}
/>
