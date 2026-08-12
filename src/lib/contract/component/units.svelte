<script lang="ts">
	import { Input } from '$lib/design/primitive/input';
	import { cn } from '$lib/design/tailwind';
	import UnitPane from './unit-pane.svelte';
	import {
		useFetchAssignableContractUnits,
		useFetchContract,
		useFetchContractUnits,
		useSetContractUnits
	} from '$lib/contract/query';
	import { toTransferredUnitIds } from '$lib/contract/unit-transfer';
	import { LL } from '$lib/i18n/i18n-svelte';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/**
	 * A contract's units, read and chosen in the same place.
	 *
	 * A pane's units are directory rows, and the transfer is a control on the row rather than a door
	 * to a form: the reading and the writing are one gesture here, which is the narrow case
	 * ADR 0029 excepts from ADR 0020.
	 *
	 * Where the contract's units are locked there is nothing to transfer, so there is one pane
	 * rather than two — see the layout below.
	 */
	let { contractId }: { contractId: number } = $props();

	let search = $state('');

	const contractQuery = useFetchContract(() => contractId);
	// both panes, flagged: what the contract holds and what it could hold differ by one field,
	// so the two sides can never disagree about a unit.
	const assignableQuery = useFetchAssignableContractUnits(() => ({ contractId, search }));
	// what the contract holds today, unfiltered. A transfer writes the whole set, and the set it
	// writes must never be the one the search happens to be showing.
	const heldQuery = useFetchContractUnits(() => contractId);

	const setMutation = useSetContractUnits();

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

	const assignable = $derived(assignableQuery.data ?? []);
	const held = $derived(assignable.filter((unit) => unit.isAssigned));
	const available = $derived(assignable.filter((unit) => !unit.isAssigned));

	const heldUnitIds = $derived((heldQuery.data ?? []).map((unit) => unit.id));

	// one transfer settles before the next may start. Each writes a set computed from what the
	// record holds, so a second press taken before the refetch lands would compute its set from
	// the state before the first — and commit the reader's earlier choice back over their later
	// one.
	const isTransferring = $derived(setMutation.isPending || heldQuery.isFetching);

	function transfer(unitId: number, wasHeld: boolean) {
		setMutation.mutate({
			contractId,
			unitIds: toTransferredUnitIds(heldUnitIds, unitId, wasHeld)
		});
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	{#if lockNotice}
		<p
			class="shrink-0 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-start text-xs text-muted-foreground"
		>
			{lockNotice}
		</p>
	{:else}
		<p class="shrink-0 text-start text-xs text-muted-foreground">
			{$LL.contracts.units.transferDescription()}
		</p>
	{/if}

	<Input
		type="search"
		bind:value={search}
		placeholder={$LL.common.table.searchPlaceholder()}
		aria-label={$LL.common.ui.search()}
		class="shrink-0"
	/>

	<!-- the panes stack below the shell's breakpoint, and they are start and end rather than
	     left and right: neither the order nor the controls may depend on a physical side.

	     A locked contract gets one pane, full width, so the assigned units lay out as a grid: the
	     available list answers a question the reader is not allowed to ask, and a column of units
	     beside a control that has been removed is worse than absent. The notice above already says
	     why the contract is locked. -->
	<div class={cn('grid min-h-0 flex-1 grid-cols-1 gap-4', !isLocked && 'shell:grid-cols-2')}>
		<UnitPane
			heading={$LL.contracts.units.assigned()}
			units={held}
			empty={$LL.contracts.units.noAssignedUnits()}
			label={$LL.common.actions.remove()}
			icon={MinusIcon}
			wasHeld={true}
			isLoading={assignableQuery.isLoading}
			{isLocked}
			{isTransferring}
			gridded={isLocked}
			onTransfer={transfer}
		/>
		{#if !isLocked}
			<UnitPane
				heading={$LL.contracts.units.available()}
				units={available}
				empty={$LL.contracts.units.noAvailableUnits()}
				label={$LL.common.actions.add()}
				icon={PlusIcon}
				wasHeld={false}
				isLoading={assignableQuery.isLoading}
				{isLocked}
				{isTransferring}
				onTransfer={transfer}
			/>
		{/if}
	</div>
</div>
