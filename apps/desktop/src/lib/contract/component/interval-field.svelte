<script lang="ts">
	import type { Contract } from '$lib/platform/database/schema';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import type { ContractForm } from '$lib/contract/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { SuperForm } from 'sveltekit-superforms';

	/** The contract form's cycle: one of four intervals. Locked on a renewal. */
	let { superform, disabled }: { superform: SuperForm<ContractForm>; disabled: boolean } = $props();

	const form = $derived(superform.form);
	const errors = $derived(superform.errors);

	const intervals = [
		{
			value: '1m',
			get label() {
				return $LL.contracts.intervals.monthly();
			}
		},
		{
			value: '3m',
			get label() {
				return $LL.contracts.intervals.quarterly();
			}
		},
		{
			value: '6m',
			get label() {
				return $LL.contracts.intervals.semiAnnual();
			}
		},
		{
			value: '12m',
			get label() {
				return $LL.contracts.intervals.annual();
			}
		}
	] as const;
</script>

<Form.Field form={superform} name="interval" class="group relative">
	<Form.Control>
		<Form.Label>{$LL.common.labels.cycle()}</Form.Label>
		<!-- four exclusive choices, so a toggle group rather than a menu: all four are seen
		     side by side ([[rules/interface]], *Field kinds*). -->
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			class="w-full"
			aria-label={$LL.common.labels.cycle()}
			aria-invalid={$errors.interval ? 'true' : undefined}
			{disabled}
			value={$form.interval}
			onValueChange={(next) => {
				// pressing the one already chosen would unset a single group; a contract
				// always has a cycle.
				if (next) $form.interval = next as Contract['interval'];
			}}
		>
			{#each intervals as interval (interval.value)}
				<ToggleGroup.Item value={interval.value} class="flex-1 capitalize">
					{interval.label}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</Form.Control>
	<FieldError />
</Form.Field>
