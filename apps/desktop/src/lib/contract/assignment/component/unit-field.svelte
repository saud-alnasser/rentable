<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Command from '@rentable/design/primitive/command/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { parseDateInput } from '$lib/date';
	import { getIntlLocale } from '$lib/platform/locale';
	import { cn } from '@rentable/design/tailwind.js';
	import type { ContractForm } from '$lib/contract/form';
	import type { ContractPrefill } from '$lib/contract/host.svelte';
	import { useFetchAssignableUnitsForTerm } from '$lib/contract/query';
	import { useReadUnit } from '$lib/complex/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { SuperForm } from 'sveltekit-superforms';
	import { untrack } from 'svelte';

	/**
	 * The units a new contract is created holding, chosen on the contract form: other records, so a
	 * combobox over their search ([[rules/interface]], *Field kinds*), choosing several, offering
	 * only the units free over the term the form states. Drawn only where the form creates a
	 * contract; an edit and a renewal never choose units.
	 */
	let {
		superform,
		open,
		prefill,
		pickerOpen = $bindable(),
		search = $bindable()
	}: {
		superform: SuperForm<ContractForm>;
		/** whether the form is open. */
		open: boolean;
		/** what the contract starts with, where whoever opened the form already knew its units. */
		prefill?: ContractPrefill;
		/** whether the picker is open, which the form shuts as it opens and closes. */
		pickerOpen: boolean;
		/** the picker's search, which the form clears as it opens and closes. */
		search: string;
	} = $props();

	const form = $derived(superform.form);
	const errors = $derived(superform.errors);

	// what each chosen unit is called, kept as it is chosen: a search that narrows past a chosen
	// unit must not leave the field unable to name it.
	let chosenUnitNames = $state<Record<string, string>>({});

	// the term the units are weighed against, in order, as the payload will state it. Absent until
	// both ends are set, because the conflict rule has nothing to read before then.
	const unitTerm = $derived.by(() => {
		if (!$form.start || !$form.end) return undefined;

		const start = parseDateInput($form.start);
		const end = parseDateInput($form.end);

		return start <= end ? { start, end } : { start: end, end: start };
	});

	// the units free over the term, narrowed in SQL by the picker's search.
	const freeUnitsQuery = useFetchAssignableUnitsForTerm(() => ({
		start: unitTerm?.start,
		end: unitTerm?.end,
		search,
		enabled: open
	}));
	const freeUnits = $derived(freeUnitsQuery.data ?? []);

	// the complex is named only to a reader who may view complexes (effort 838, requirement 10).
	const toUnitName = (unit: { name: string; complexName?: string }) =>
		unit.complexName === undefined ? unit.name : `${unit.name} · ${unit.complexName}`;

	// a unit chosen before the form opened (a unit's own page asked for the contract) is named from
	// its own read: the free units are not read until the term is set, and need not include it.
	const readUnit = useReadUnit();

	$effect(() => {
		if (!open) return;

		const prefilledUnitIds = prefill?.unitIds ?? [];

		untrack(() => {
			for (const id of prefilledUnitIds) {
				if (chosenUnitNames[id]) continue;

				readUnit(id)
					.then((unit) => {
						if (unit) chosenUnitNames[id] = toUnitName(unit);
					})
					.catch(() => {});
			}
		});
	});

	// the chosen units the term leaves out, because another contract holds them over it. Read only
	// off the whole free set for this term (no search narrowing it, nothing still arriving), since
	// a unit missing from a narrowed or a stale list says nothing about the term.
	const heldUnitIds = $derived.by(() => {
		if (!unitTerm || search.trim() || freeUnitsQuery.isFetching || !freeUnitsQuery.data) {
			return [];
		}

		const freeUnitIds = new Set(freeUnits.map((unit) => unit.id));

		return $form.unitIds.filter((id) => !freeUnitIds.has(id));
	});

	const unchooseUnit = (id: string) => {
		$form.unitIds = $form.unitIds.filter((chosen) => chosen !== id);
	};

	const toggleUnit = (unit: { id: string; name: string; complexName?: string }) => {
		if ($form.unitIds.includes(unit.id)) {
			$form.unitIds = $form.unitIds.filter((id) => id !== unit.id);
		} else {
			chosenUnitNames[unit.id] = toUnitName(unit);
			$form.unitIds = [...$form.unitIds, unit.id];
		}
	};

	// the chosen units, named in the reader's list style. A unit chosen before its name was read
	// (one a caller prefilled) is named once the free units arrive.
	const chosenUnitsLabel = $derived.by(() => {
		const freeUnitNames = new Map(freeUnits.map((unit) => [unit.id, toUnitName(unit)]));
		const names = $form.unitIds.map((id) => chosenUnitNames[id] ?? freeUnitNames.get(id) ?? '…');

		return new Intl.ListFormat(getIntlLocale($locale), { type: 'conjunction' }).format(names);
	});
</script>

<!-- it follows the term because what it offers is decided by the term; it stays open while the
     reader picks. -->
<Form.Field form={superform} name="unitIds" class="group relative">
	<Form.Control>
		<Form.Label>{$LL.contracts.form.unitsOptional()}</Form.Label>
		<Popover.Root bind:open={pickerOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="outline"
						disabled={!unitTerm}
						class={cn(
							'w-full justify-between font-normal',
							insetControl,
							$form.unitIds.length === 0 && 'text-muted-foreground'
						)}
						aria-invalid={$errors.unitIds?._errors ? 'true' : undefined}
					>
						<span class="min-w-0 flex-1 truncate text-start">
							{$form.unitIds.length > 0 ? chosenUnitsLabel : $LL.contracts.form.chooseUnits()}
						</span>
						<ChevronDownIcon class="size-4 shrink-0 opacity-50" />
					</Button>
				{/snippet}
			</Popover.Trigger>

			<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
				<Command.Root class="w-full" shouldFilter={false}>
					<Command.Input
						bind:value={search}
						placeholder={$LL.contracts.form.searchUnitPlaceholder()}
					/>
					<Command.List>
						<!-- a chosen unit the term leaves out stays in the list, checked and saying
						     why, so the reader can take it back out; the free ones follow. -->
						{#if heldUnitIds.length > 0}
							<Command.Group>
								{#each heldUnitIds as id (id)}
									<Command.Item value={id} onSelect={() => unchooseUnit(id)}>
										<div class="flex min-w-0 flex-1 flex-col text-start">
											<span class="truncate">{chosenUnitNames[id] ?? '…'}</span>
											<span class="truncate text-xs text-muted-foreground">
												{$LL.contracts.form.unitHeldOverTerm()}
											</span>
										</div>
										<CheckIcon class="ms-auto size-4" />
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
						{#if freeUnitsQuery.isLoading && freeUnits.length === 0}
							<div class="p-3 text-sm text-muted-foreground">
								{$LL.contracts.form.loadingUnits()}
							</div>
						{:else if freeUnits.length === 0}
							<div class="p-3 text-sm text-muted-foreground">
								{$LL.contracts.form.noUnitFree()}
							</div>
						{:else}
							<Command.Group>
								{#each freeUnits as unit (unit.id)}
									<Command.Item value={unit.id} onSelect={() => toggleUnit(unit)}>
										<div class="flex min-w-0 flex-1 flex-col text-start">
											<span class="truncate">{unit.name}</span>
											<span class="truncate text-xs text-muted-foreground">
												{unit.complexName}
											</span>
										</div>
										<CheckIcon
											class={cn(
												'ms-auto size-4',
												$form.unitIds.includes(unit.id) ? 'opacity-100' : 'opacity-0'
											)}
										/>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</Form.Control>
	<Form.Description>
		{#if heldUnitIds.length > 0}
			{$LL.common.refusals.contract.unitsTaken()}
		{:else}
			{unitTerm ? $LL.contracts.form.unitsHint() : $LL.contracts.form.unitsNeedTerm()}
		{/if}
	</Form.Description>
	<FieldError />
</Form.Field>
