<script lang="ts">
	import type api from '$lib/api/caller';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface from '$lib/design/block/form-surface.svelte';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import { Skeleton } from '$lib/design/primitive/skeleton';
	import {
		useFetchAssignableContractUnits,
		useFetchContractUnits,
		useSetContractUnits
	} from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';

	/**
	 * Choosing a contract's units, on the shared form surface.
	 *
	 * It writes, so it is a form rather than a panel inside the surface that reads (ADR 0020,
	 * ADR 0024). Both directions live here — what is available on one side, what the contract
	 * holds on the other — and the whole set is committed once. What may be held is the
	 * procedure's to refuse; this shows whatever the domain says.
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

	type AssignableUnit = Awaited<ReturnType<typeof api.contract.units.getAssignableMany>>[number];

	const AssignmentSchema = z.object({ unitIds: z.array(z.number()) });

	type AssignmentForm = z.infer<typeof AssignmentSchema>;

	const setMutation = useSetContractUnits();

	let search = $state('');

	const assignableQuery = useFetchAssignableContractUnits(() => ({
		contractId,
		search,
		enabled: open
	}));
	// what the contract holds today, unfiltered: the search narrows what the panes show and
	// must not narrow what the surface opens on.
	const heldQuery = useFetchContractUnits(() => contractId);

	let { form, errors, enhance, reset, ...rest } = superForm<AssignmentForm>(
		defaults(zod4(AssignmentSchema)),
		{
			SPA: true,
			resetForm: false,
			validators: zod4(AssignmentSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				try {
					await setMutation.mutateAsync({ contractId, unitIds: form.data.unitIds });

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

	const assignable = $derived(assignableQuery.data ?? []);
	const chosen = $derived(new Set($form.unitIds));

	const available = $derived(assignable.filter((unit) => !chosen.has(unit.id)));
	const assigned = $derived(assignable.filter((unit) => chosen.has(unit.id)));

	const add = (unitId: number) => ($form.unitIds = [...$form.unitIds, unitId]);
	const remove = (unitId: number) => ($form.unitIds = $form.unitIds.filter((id) => id !== unitId));

	// the surface opens on what the contract holds today, so the panes start where the record
	// is rather than empty. It seeds on the opening and never again: a refetch while the sheet
	// is open — invalidation here is repository-wide — would otherwise discard what the user
	// has moved so far.
	let isSeeded = $state(false);

	$effect(() => {
		if (!open) {
			isSeeded = false;

			return;
		}

		if (isSeeded || heldQuery.isLoading) return;

		isSeeded = true;
		reset();
		search = '';
		$form.unitIds = (heldQuery.data ?? []).map((unit) => unit.id);
	});
</script>

{#snippet pane({
	heading,
	units,
	empty,
	move,
	label,
	icon
}: {
	heading: string;
	units: AssignableUnit[];
	empty: string;
	/** what pressing a row's control does to it — the only difference between the two panes. */
	move: (unitId: number) => void;
	label: string;
	icon: typeof PlusIcon;
})}
	<section class="flex min-h-0 flex-col gap-2">
		<h3 class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
			{heading}
			<span class="ms-1 tracking-normal">({units.length})</span>
		</h3>

		{#if assignableQuery.isLoading}
			<div class="flex flex-col gap-2">
				<Skeleton class="h-14 w-full rounded-xl" />
				<Skeleton class="h-14 w-full rounded-xl" />
			</div>
		{:else if units.length === 0}
			<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
				{empty}
			</p>
		{:else}
			<ul class="app-scroll flex max-h-56 flex-col gap-2 overflow-y-auto pe-1">
				{#each units as unit (unit.id)}
					<li
						class="flex items-center gap-3 rounded-xl border bg-muted p-3 transition-colors hover:bg-accent"
					>
						<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
							<span class="truncate text-sm font-medium">{unit.name}</span>
							<span class="truncate text-xs text-muted-foreground">{unit.complexName}</span>
						</span>

						<Cell.Status status={unit.status} />

						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label={`${label} ${unit.name}`}
							onclick={() => move(unit.id)}
						>
							{@const Icon = icon}
							<Icon class="size-4" />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.contracts.units.assignTitle()}
	description={$LL.contracts.units.transferDescription()}
>
	<div class="flex flex-col gap-4">
		<Input
			type="search"
			bind:value={search}
			placeholder={$LL.common.table.searchPlaceholder()}
			aria-label={$LL.common.ui.search()}
		/>

		<Form.Field form={superform} name="unitIds" class="group relative">
			<Form.Control>
				<!-- the panes stack below the shell's breakpoint, and they are start and end rather
				     than left and right: neither the order nor the controls may depend on a
				     physical side. -->
				<div class="grid grid-cols-1 gap-4 shell:grid-cols-2">
					{@render pane({
						heading: $LL.contracts.units.available(),
						units: available,
						empty: $LL.contracts.units.noAvailableUnits(),
						move: add,
						label: $LL.common.actions.add(),
						icon: PlusIcon
					})}
					{@render pane({
						heading: $LL.contracts.units.assigned(),
						units: assigned,
						empty: $LL.contracts.units.noAssignedUnits(),
						move: remove,
						label: $LL.common.actions.remove(),
						icon: MinusIcon
					})}
				</div>
			</Form.Control>
			<FieldError />
		</Form.Field>
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={setMutation.isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={setMutation.isPending} class="capitalize">
			{setMutation.isPending ? $LL.common.actions.saving() : $LL.common.actions.save()}
			{#if $form.unitIds.length > 0}
				<span class="text-xs opacity-80">({$form.unitIds.length})</span>
			{/if}
		</Button>
	{/snippet}
</FormSurface>
