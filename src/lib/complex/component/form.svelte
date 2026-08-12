<script lang="ts">
	import { ComplexSchema, type Complex } from '$lib/platform/database/schema';
	import { Button } from '$lib/design/primitive/button';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateComplex, useUpdateComplex } from '$lib/complex/query';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
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
	// directory, so the list is offered only while creating one.
	let unitNames = $state<string[]>([]);
	let unitDraft = $state('');
	let unitError = $state<string | undefined>(undefined);

	const isCreating = $derived(!value?.id);

	function addUnit() {
		const name = unitDraft.trim();

		if (!name) return;

		// the same rule the procedure enforces over the arriving set, answered while the user is
		// still holding the name rather than after they submit.
		if (unitNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
			unitError = $LL.complexes.form.duplicateUnitName({ name });

			return;
		}

		unitNames = [...unitNames, name];
		unitDraft = '';
		unitError = undefined;
	}

	function removeUnit(name: string) {
		unitNames = unitNames.filter((existing) => existing !== name);
		unitError = undefined;
	}

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
						await CreateMutation.mutateAsync({
							...(form.data as Complex),
							units: unitNames.map((name) => ({ name }))
						});
					}

					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						// a collision within the unit list belongs to the list rather than to the
						// complex's own name field, which is what the other refusal is about.
						if (e.message.includes('used twice')) {
							unitError = $LL.complexes.form.duplicateUnitNames();
						} else if (e.message.includes('name')) {
							setError(form, 'name', $LL.complexes.form.duplicateName());
						}
					} else {
						toast.error($LL.common.messages.unexpectedError());
					}
				}
			}
		}
	);

	$effect(() => {
		if (open) {
			unitNames = [];
			unitDraft = '';
			unitError = undefined;

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

<FormSurface {open} {onOpenChange} {enhance} weight="light" title={$LL.common.labels.complex()}>
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

				<div class="flex items-center gap-2">
					<Input
						bind:value={unitDraft}
						placeholder={$LL.complexes.form.unitName()}
						class={insetControl}
						aria-invalid={unitError ? 'true' : undefined}
						aria-label={$LL.complexes.form.unitName()}
						onkeydown={(event) => {
							if (event.key !== 'Enter') return;

							// the surface is a form, so Enter would submit the complex with the name
							// still sitting unadded in the field.
							event.preventDefault();
							addUnit();
						}}
					/>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={$LL.common.actions.add()}
						disabled={!unitDraft.trim()}
						onclick={addUnit}
					>
						<PlusIcon class="size-4" />
					</Button>
				</div>

				{#if unitError}
					<p class="text-sm text-destructive">{unitError}</p>
				{/if}

				{#if unitNames.length === 0}
					<p class="rounded-xl border border-dashed bg-muted p-3 text-sm text-muted-foreground">
						{$LL.complexes.form.noUnitsYet()}
					</p>
				{:else}
					<ul class="app-scroll flex max-h-40 flex-col gap-2 overflow-y-auto pe-1">
						{#each unitNames as name (name)}
							<li class="flex items-center gap-2 rounded-xl bg-muted p-2 ps-3">
								<span class="min-w-0 flex-1 truncate text-sm">{name}</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={`${$LL.common.actions.remove()} ${name}`}
									onclick={() => removeUnit(name)}
								>
									<XIcon class="size-4" />
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
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
