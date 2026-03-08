<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import { Label } from '$lib/common/components/fragments/label';
	import * as Select from '$lib/common/components/fragments/select';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import { useFetchComplexes } from '$lib/resources/complexes/hooks/queries';
	import {
		useAssignContractUnits,
		useFetchContract,
		useFetchContractUnits,
		useFetchVacantContractUnits,
		useRemoveContractUnit
	} from '$lib/resources/contracts/hooks/queries';

	let { contractId }: { contractId: number } = $props();

	const contractQuery = useFetchContract(() => contractId);
	const complexesQuery = useFetchComplexes();
	const assignedUnitsQuery = useFetchContractUnits(() => contractId);
	const assignMutation = useAssignContractUnits();
	const removeMutation = useRemoveContractUnit();

	let selectedComplexId = $state('');
	let selectedUnitIds = $state<number[]>([]);

	let selectedComplexNumber = $derived.by(() => {
		const parsed = Number(selectedComplexId);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	});

	let hasRegisteredPayments = $derived.by(() => (contractQuery.data?.paidAmount ?? 0) > 0);
	let isTerminated = $derived(contractQuery.data?.status === 'terminated');
	let isLocked = $derived(isTerminated || hasRegisteredPayments);

	let selectedComplex = $derived.by(() =>
		(complexesQuery.data ?? []).find((complex) => complex.id.toString() === selectedComplexId)
	);
	let previousSelectedComplexNumber = $state<number | undefined>(undefined);

	const vacantUnitsQuery = useFetchVacantContractUnits(() => ({
		contractId,
		complexId: selectedComplexNumber
	}));

	const getContractLabel = () => {
		const govId = contractQuery.data?.govId?.trim();

		return govId || undefined;
	};

	const formatContractTitle = () => {
		if (contractQuery.isLoading) return 'Loading contract...';

		const contractLabel = getContractLabel();

		return contractLabel ? `Units for ${contractLabel}` : 'Units';
	};

	const getLockSummary = () => {
		if (isTerminated) {
			return 'This contract is terminated and locked. Unit assignments are read-only.';
		}

		if (hasRegisteredPayments) {
			return 'This contract has registered payments. Unit assignments are locked.';
		}

		return 'Assign available units by complex, then manage the units already linked to this contract.';
	};

	const getLockNotice = () => {
		if (isTerminated) {
			return 'Terminated contracts are locked. You can review linked units here, but you cannot assign or remove units until the contract is unterminated.';
		}

		if (hasRegisteredPayments) {
			return 'Contracts with registered payments are locked. You can review linked units here, but you cannot assign or remove units after payments have been recorded.';
		}

		return undefined;
	};

	function toggleUnit(unitId: number, checked: boolean) {
		if (isLocked) return;

		selectedUnitIds = checked
			? [...new Set([...selectedUnitIds, unitId])]
			: selectedUnitIds.filter((id) => id !== unitId);
	}

	async function assignUnits() {
		if (isLocked || !selectedComplexNumber || selectedUnitIds.length === 0) return;

		await assignMutation.mutateAsync({
			contractId,
			complexId: selectedComplexNumber,
			unitIds: selectedUnitIds
		});

		selectedUnitIds = [];
	}

	$effect(() => {
		if (previousSelectedComplexNumber === selectedComplexNumber) return;

		previousSelectedComplexNumber = selectedComplexNumber;
		selectedUnitIds = [];
	});
</script>

<div class="flex flex-col gap-4">
	{#if contractQuery.isLoading}
		<Skeleton class="h-10 w-full" />
	{:else}
		<div class="space-y-1">
			<h1 class="text-2xl font-bold">{formatContractTitle()}</h1>
			<p class="text-sm text-muted-foreground">{getLockSummary()}</p>
		</div>
	{/if}

	{#if isLocked}
		<p
			class="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground"
		>
			{getLockNotice()}
		</p>
	{/if}

	<div class={`grid gap-4 ${isLocked ? '' : 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'}`}>
		{#if !isLocked}
			<section class="rounded-lg border p-4">
				<div class="mb-4 space-y-1">
					<h2 class="font-semibold">Available units</h2>
					<p class="text-sm text-muted-foreground">
						Choose a complex to show units that are available for this contract timeframe. Units
						linked to overlapping contracts are excluded.
					</p>
				</div>

				<div class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
					<div class="space-y-2">
						<Label>Complex</Label>
						<Select.Root type="single" bind:value={selectedComplexId}>
							<Select.Trigger class="w-full" disabled={complexesQuery.isLoading || isLocked}>
								{selectedComplex?.name ||
									(complexesQuery.isLoading ? 'loading complexes...' : 'select complex')}
							</Select.Trigger>
							<Select.Content>
								{#each complexesQuery.data ?? [] as complex (complex.id)}
									<Select.Item value={complex.id.toString()} label={complex.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<Button
						onclick={assignUnits}
						disabled={isLocked ||
							!selectedComplexNumber ||
							selectedUnitIds.length === 0 ||
							assignMutation.isPending}
						class="capitalize"
					>
						{assignMutation.isPending ? 'assigning...' : 'assign selected'}
					</Button>
				</div>

				{#if !selectedComplexNumber}
					<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
						Select a complex to load available units.
					</p>
				{:else if vacantUnitsQuery.isLoading}
					<Skeleton class="h-40 w-full" />
				{:else if (vacantUnitsQuery.data?.length ?? 0) === 0}
					<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
						No units are available for this contract timeframe in the selected complex.
					</p>
				{:else}
					<div class="grid gap-2">
						{#each vacantUnitsQuery.data ?? [] as unit (unit.id)}
							<label class="flex items-center justify-between rounded-md border p-3 text-sm">
								<div class="flex items-center gap-3">
									<input
										type="checkbox"
										checked={selectedUnitIds.includes(unit.id)}
										disabled={isLocked}
										onchange={(event) => toggleUnit(unit.id, event.currentTarget.checked)}
										class="size-4"
									/>
									<span>{unit.name}</span>
								</div>
							</label>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<section class="rounded-lg border p-4">
			<div class="mb-4 space-y-1">
				<h2 class="font-semibold">Assigned units</h2>
				<p class="text-sm text-muted-foreground">
					{isLocked
						? 'Review the units currently linked to this contract.'
						: 'Remove a unit from this contract when it should no longer be linked to it.'}
				</p>
			</div>

			{#if assignedUnitsQuery.isLoading}
				<Skeleton class="h-40 w-full" />
			{:else if (assignedUnitsQuery.data?.length ?? 0) === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
					No units are assigned to this contract yet.
				</p>
			{:else}
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted text-left">
							<tr>
								<th class="px-4 py-3 font-medium">Unit</th>
								<th class="px-4 py-3 font-medium">Complex</th>
								{#if !isLocked}
									<th class="px-4 py-3 text-right font-medium">Action</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each assignedUnitsQuery.data ?? [] as unit (unit.id)}
								<tr class="border-t">
									<td class="px-4 py-3">{unit.name}</td>
									<td class="px-4 py-3">{unit.complexName}</td>
									{#if !isLocked}
										<td class="px-4 py-3 text-right">
											<Button
												variant="destructive"
												disabled={isLocked || removeMutation.isPending}
												onclick={async () => {
													if (isLocked) return;

													await removeMutation.mutateAsync({ contractId, unitId: unit.id });
												}}
											>
												remove
											</Button>
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>
</div>
