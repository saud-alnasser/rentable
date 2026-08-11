<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import * as Select from '$lib/design/primitive/select';
	import { Skeleton } from '$lib/design/primitive/skeleton';
	import { cn } from '$lib/design/tailwind';
	import { useFetchComplexes } from '$lib/complex/query';
	import { useAssignContractUnits, useFetchVacantContractUnits } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';

	/**
	 * Assigning units to a contract, on the shared form surface.
	 *
	 * It writes, so it is a form rather than a panel inside the surface that reads
	 * (ADR 0020, ADR 0024). What may be assigned is the procedure's to refuse — this asks for
	 * the vacant units of one complex and reports back whatever the domain says.
	 */
	let {
		contractId,
		open,
		onOpenChange
	}: {
		contractId: number;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	const AssignmentSchema = z.object({
		complexId: z.string().min(1, $LL.contracts.units.selectComplex()),
		unitIds: z.array(z.number()).min(1, $LL.contracts.units.selectUnits())
	});

	type AssignmentForm = z.infer<typeof AssignmentSchema>;

	const assignMutation = useAssignContractUnits();
	const complexesQuery = useFetchComplexes();

	let { form, errors, enhance, reset, ...rest } = superForm<AssignmentForm>(
		defaults(zod4(AssignmentSchema)),
		{
			SPA: true,
			resetForm: false,
			validators: zod4(AssignmentSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				try {
					await assignMutation.mutateAsync({
						contractId,
						complexId: Number(form.data.complexId),
						unitIds: form.data.unitIds
					});

					onOpenChange(false);
				} catch (e) {
					// the refusals are the contract module's, and they are shown as written: a
					// terminated contract and one with payments recorded both land here. They
					// belong to the form rather than to a field — neither is caused by the value
					// in one, and both refuse the whole submission.
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						setError(form, '', e.message);
					} else {
						toast.error($LL.common.messages.unexpectedError());
					}
				}
			}
		}
	);

	const superform = { form, errors, enhance, reset, ...rest };

	const selectedComplexId = $derived.by(() => {
		const parsed = Number($form.complexId);

		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	});
	const selectedComplex = $derived(
		(complexesQuery.data ?? []).find((complex) => complex.id.toString() === $form.complexId)
	);

	const vacantUnitsQuery = useFetchVacantContractUnits(() => ({
		contractId,
		complexId: selectedComplexId
	}));
	const vacantUnits = $derived(vacantUnitsQuery.data ?? []);

	const toggleUnit = (unitId: number) => {
		$form.unitIds = $form.unitIds.includes(unitId)
			? $form.unitIds.filter((id) => id !== unitId)
			: [...$form.unitIds, unitId];
	};

	// a unit chosen in one complex means nothing in another, so the selection is dropped with
	// the complex rather than carried into a list that no longer holds it.
	let lastComplexId = $state<number | undefined>(undefined);
	$effect(() => {
		if (lastComplexId === selectedComplexId) return;

		lastComplexId = selectedComplexId;
		$form.unitIds = [];
	});

	$effect(() => {
		if (open) {
			reset();
		}
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.contracts.units.assignTitle()}
	description={$LL.contracts.units.availableDescription()}
>
	<div class="flex flex-col gap-4">
		<Form.Field form={superform} name="complexId" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.labels.complex()}</Form.Label>
				<Select.Root type="single" bind:value={$form.complexId}>
					<Select.Trigger class="w-full" disabled={complexesQuery.isLoading}>
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
			</Form.Control>
			<FieldError />
		</Form.Field>

		<Form.Field form={superform} name="unitIds" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.nav.units()}</Form.Label>
				{#if !selectedComplexId}
					<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
						{$LL.contracts.units.selectComplex()}
					</p>
				{:else if vacantUnitsQuery.isLoading}
					<div class="flex flex-col gap-2">
						<Skeleton class="h-12 w-full rounded-xl" />
						<Skeleton class="h-12 w-full rounded-xl" />
					</div>
				{:else if vacantUnits.length === 0}
					<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
						{$LL.contracts.units.noAvailableUnits()}
					</p>
				{:else}
					<div class="flex flex-col gap-2">
						{#each vacantUnits as unit (unit.id)}
							{@const isSelected = $form.unitIds.includes(unit.id)}
							<button
								type="button"
								class={cn(
									'flex items-center gap-3 rounded-xl border bg-muted p-3 text-start transition-[background-color,border-color] hover:bg-accent',
									isSelected && 'border-primary bg-accent ring-1 ring-primary'
								)}
								aria-pressed={isSelected}
								onclick={() => toggleUnit(unit.id)}
							>
								<span
									class={cn(
										'flex size-5 shrink-0 items-center justify-center rounded-md border bg-muted text-transparent transition-colors',
										isSelected && 'border-primary bg-primary text-primary-foreground'
									)}
								>
									<CheckIcon class="size-3.5" />
								</span>
								<span class="min-w-0 flex-1 truncate font-medium">{unit.name}</span>
							</button>
						{/each}
					</div>
				{/if}
			</Form.Control>
			<FieldError />
		</Form.Field>
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={assignMutation.isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={assignMutation.isPending} class="capitalize">
			{assignMutation.isPending
				? $LL.common.actions.assigning()
				: $LL.common.actions.assignSelected()}
			{#if $form.unitIds.length > 0}
				<span class="text-xs opacity-80">({$form.unitIds.length})</span>
			{/if}
		</Button>
	{/snippet}
</FormSurface>
