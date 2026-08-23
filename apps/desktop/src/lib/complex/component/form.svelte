<script lang="ts">
	import { ComplexSchema, type Complex } from '$lib/platform/database/schema';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '$lib/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateComplex, useUpdateComplex } from '$lib/complex/query';
	import type { DraftUnit } from '$lib/complex/unit-name';
	import UnitEntry from './unit-entry.svelte';
	import { TRPCError } from '@trpc/server';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	const ComplexFormSchema = ComplexSchema.partial({ id: true });
	const CreateMutation = useCreateComplex();
	const UpdateMutation = useUpdateComplex();

	type ComplexForm = z.infer<typeof ComplexFormSchema>;

	let {
		value,
		open,
		onOpenChange
	}: {
		/** the complex being edited, or the details a new one starts from when duplicating. */
		value?: Partial<ComplexForm>;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	// the units a complex is being created with. They are the form's own state rather than a
	// field of the schema: nothing about them is persisted until the complex is, and the whole
	// list goes down with it as one write. An existing complex manages its units in its own
	// directory, and adds them there through the same component this renders.
	let units = $state<DraftUnit[]>([]);
	let unitError = $state<string | undefined>(undefined);
	let unitEntry = $state<ReturnType<typeof UnitEntry> | undefined>(undefined);

	const isCreating = $derived(!value?.id);

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<ComplexForm>(
		defaults(zod4(ComplexFormSchema)),
		{
			SPA: true,
			validators: zod4(ComplexFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				if (value && form.data.id) {
					const unchanged = value.name === form.data.name && value.location === form.data.location;

					if (unchanged) {
						onOpenChange(false);

						return;
					}
				}

				try {
					if (form.data.id) {
						await UpdateMutation.mutateAsync(form.data as Complex);
					} else {
						// the list is what goes down. A line still in the entry joins the list on
						// this press rather than being created with it, so nothing is written that
						// the reader has not seen and had the chance to correct.
						const names = unitEntry?.collect();

						if (names === undefined) return;

						await CreateMutation.mutateAsync({
							...(form.data as Complex),
							units: names.map((name) => ({ name }))
						});
					}

					onOpenChange(false);
				} catch (e) {
					// an unexpected failure is the shared error handler's to report, and it already has:
					// what is left here is the refusal, mapped onto the field the reader would fix.
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						// a collision within the unit list belongs to the list rather than to the
						// complex's own name field, which is what the other refusal is about.
						if (e.message.includes('used twice')) {
							unitError = $LL.complexes.form.duplicateUnitNames();
						} else if (e.message.includes('name')) {
							setError(form, 'name', $LL.complexes.form.duplicateName());
						}
					}
				}
			}
		}
	);

	$effect(() => {
		if (open) {
			if (value) {
				// a form field holds a string rather than nothing, and the surface may open on a
				// record that states neither.
				form.set({ id: value.id, name: value.name ?? '', location: value.location ?? '' });
			} else {
				reset();
			}
		}
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };
</script>

<!-- the weight follows the create case, which carries the unit-building surface as well as the
     two fields; editing a complex is still those two fields and keeps the panel. -->
<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight={isCreating ? 'heavy' : 'light'}
	title={$LL.common.labels.complex()}
>
	<!-- no pinned read-out: a complex is a name and a location, and a panel restating the two
	     fields directly beneath it is decoration rather than an answer. -->
	<div class="flex flex-col gap-4">
		<Form.Field form={superform} name="name" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.labels.name()}</Form.Label>
				<Input
					bind:value={$form.name}
					placeholder={$LL.common.labels.name()}
					class={insetControl}
					aria-invalid={$errors.name ? 'true' : undefined}
					{...$constraints.name}
				/>
			</Form.Control>
			<FieldError />
		</Form.Field>

		<Form.Field form={superform} name="location" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.labels.location()}</Form.Label>
				<Input
					bind:value={$form.location}
					placeholder={$LL.common.labels.location()}
					class={insetControl}
					aria-invalid={$errors.location ? 'true' : undefined}
					{...$constraints.location}
				/>
			</Form.Control>
			<FieldError />
		</Form.Field>

		{#if isCreating}
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium capitalize">{$LL.common.nav.units()}</span>

				<UnitEntry bind:this={unitEntry} bind:units bind:error={unitError} {open} />
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={CreateMutation.isPending || UpdateMutation.isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button
			type="submit"
			disabled={CreateMutation.isPending || UpdateMutation.isPending}
			class="capitalize"
		>
			{value?.id ? $LL.common.actions.update() : $LL.common.actions.create()}
		</Button>
	{/snippet}
</FormSurface>
