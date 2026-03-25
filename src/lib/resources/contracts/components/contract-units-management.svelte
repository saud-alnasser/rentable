<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import { Label } from '$lib/common/components/fragments/label';
	import * as Select from '$lib/common/components/fragments/select';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import * as Table from '$lib/common/components/fragments/table';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
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
		if (contractQuery.isLoading) return $LL.contracts.units.loadingContract();

		const contractLabel = getContractLabel();

		return contractLabel
			? $LL.contracts.units.unitsFor({ govId: contractLabel })
			: $LL.contracts.units.unitsTitle();
	};

	const getLockSummary = () => {
		if (isTerminated) {
			return $LL.contracts.units.lockSummaryTerminated();
		}

		if (hasRegisteredPayments) {
			return $LL.contracts.units.lockSummaryHasPayments();
		}

		return $LL.contracts.units.lockSummaryDefault();
	};

	const getLockNotice = () => {
		if (isTerminated) {
			return $LL.contracts.units.lockNoticeTerminated();
		}

		if (hasRegisteredPayments) {
			return $LL.contracts.units.lockNoticeHasPayments();
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

<div class="flex flex-col gap-4" dir={localesMetadata[$locale].direction}>
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
					<h2 class="font-semibold">{$LL.contracts.units.availableTitle()}</h2>
					<p class="text-sm text-muted-foreground">
						{$LL.contracts.units.availableDescription()}
					</p>
				</div>

				<div class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
					<div class="space-y-2">
						<Label>{$LL.common.labels.complex()}</Label>
						<Select.Root type="single" bind:value={selectedComplexId}>
							<Select.Trigger class="w-full" disabled={complexesQuery.isLoading || isLocked}>
								{selectedComplex?.name ||
									(complexesQuery.isLoading
										? $LL.common.messages.loadingComplexes()
										: $LL.contracts.units.selectComplexPlaceholder())}
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
						{assignMutation.isPending
							? $LL.common.actions.assigning()
							: $LL.common.actions.assignSelected()}
					</Button>
				</div>

				{#if !selectedComplexNumber}
					<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
						{$LL.contracts.units.selectComplex()}
					</p>
				{:else if vacantUnitsQuery.isLoading}
					<Skeleton class="h-40 w-full" />
				{:else if (vacantUnitsQuery.data?.length ?? 0) === 0}
					<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
						{$LL.contracts.units.noAvailableUnits()}
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
				<h2 class="font-semibold">{$LL.contracts.units.assignedTitle()}</h2>
				<p class="text-sm text-muted-foreground">
					{isLocked
						? $LL.contracts.units.assignedDescriptionLocked()
						: $LL.contracts.units.assignedDescriptionEditable()}
				</p>
			</div>

			{#if assignedUnitsQuery.isLoading}
				<Skeleton class="h-40 w-full" />
			{:else if (assignedUnitsQuery.data?.length ?? 0) === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
					{$LL.contracts.units.noAssignedUnits()}
				</p>
			{:else}
				<div class="overflow-hidden rounded-md border">
					<Table.Root class="w-full" dir={localesMetadata[$locale].direction}>
						<Table.Header>
							<Table.Row>
								<Table.Head class="px-4 py-3 text-start">{$LL.common.labels.unit()}</Table.Head>
								<Table.Head class="px-4 py-3 text-start">{$LL.common.labels.complex()}</Table.Head>
								{#if !isLocked}
									<Table.Head class="px-4 py-3 text-end">{$LL.common.labels.action()}</Table.Head>
								{/if}
							</Table.Row>
						</Table.Header>

						<Table.Body>
							{#each assignedUnitsQuery.data ?? [] as unit (unit.id)}
								<Table.Row class="border-t">
									<Table.Cell class="px-4 py-3 text-start">{unit.name}</Table.Cell>
									<Table.Cell class="px-4 py-3 text-start">{unit.complexName}</Table.Cell>
									{#if !isLocked}
										<Table.Cell class="px-4 py-3 text-end">
											<Button
												variant="destructive"
												disabled={isLocked || removeMutation.isPending}
												onclick={async () => {
													if (isLocked) return;
													await removeMutation.mutateAsync({ contractId, unitId: unit.id });
												}}
											>
												{$LL.common.actions.remove()}
											</Button>
										</Table.Cell>
									{/if}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</section>
	</div>
</div>
