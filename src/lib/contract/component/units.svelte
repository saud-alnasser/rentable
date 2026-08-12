<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import { Input } from '$lib/design/primitive/input';
	import { Skeleton } from '$lib/design/primitive/skeleton';
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
	 * Both panes are directory rows, and the transfer is a control on the row rather than a door
	 * to a form: the reading and the writing are one gesture here, which is the narrow case
	 * ADR 0029 excepts from ADR 0020.
	 */
	let { contractId }: { contractId: number } = $props();

	type AssignableUnit = Awaited<ReturnType<typeof api.contract.units.getAssignableMany>>[number];

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

{#snippet pane({
	heading,
	units,
	empty,
	label,
	icon,
	wasHeld
}: {
	heading: string;
	units: AssignableUnit[];
	empty: string;
	label: string;
	icon: typeof PlusIcon;
	/** which side these rows sit on — the only difference between the two panes. */
	wasHeld: boolean;
})}
	{@const Icon = icon}
	<section class="flex min-h-0 flex-col gap-2">
		<h3 class="shrink-0 text-xs tracking-[0.2em] text-muted-foreground uppercase">
			{heading}
			<span class="ms-1 tracking-normal">({units.length})</span>
		</h3>

		{#if assignableQuery.isLoading}
			<div class="flex flex-col gap-2">
				<Skeleton class="h-16 w-full rounded-xl" />
				<Skeleton class="h-16 w-full rounded-xl" />
			</div>
		{:else if units.length === 0}
			<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
				{empty}
			</p>
		{:else}
			<ul class="app-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pe-1">
				{#each units as unit (unit.id)}
					<li
						class="flex items-center gap-3 rounded-xl border bg-muted p-3 transition-colors hover:bg-accent"
					>
						<a
							href={resolve(`/complexes/units/${unit.id}`)}
							class="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
								<span class="truncate text-sm font-medium">{unit.name}</span>
								<span class="truncate text-xs text-muted-foreground">{unit.complexName}</span>
							</span>

							<Cell.Status status={unit.status} />
						</a>

						{#if !isLocked}
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								class="shrink-0"
								aria-label={`${label} ${unit.name}`}
								disabled={isTransferring}
								onclick={() => transfer(unit.id, wasHeld)}
							>
								<Icon class="size-4" />
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

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
	     left and right: neither the order nor the controls may depend on a physical side. -->
	<div class="grid min-h-0 flex-1 grid-cols-1 gap-4 shell:grid-cols-2">
		{@render pane({
			heading: $LL.contracts.units.assigned(),
			units: held,
			empty: $LL.contracts.units.noAssignedUnits(),
			label: $LL.common.actions.remove(),
			icon: MinusIcon,
			wasHeld: true
		})}
		{@render pane({
			heading: $LL.contracts.units.available(),
			units: available,
			empty: $LL.contracts.units.noAvailableUnits(),
			label: $LL.common.actions.add(),
			icon: PlusIcon,
			wasHeld: false
		})}
	</div>
</div>
