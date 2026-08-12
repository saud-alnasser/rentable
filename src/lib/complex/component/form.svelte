<script lang="ts">
	import { ComplexSchema, type Complex } from '$lib/platform/database/schema';
	import { Button } from '$lib/design/primitive/button';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateComplex, useUpdateComplex } from '$lib/complex/query';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
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
	//
	// Each carries a key of its own because the name is editable after it is added, and a list
	// keyed by its own text loses the field the moment the text changes.
	type DraftUnit = { key: number; name: string };

	// a run renders one editable field per unit it names, so a mistyped number must not be able to
	// ask the surface for tens of thousands of them. No building this application is for has more.
	const RUN_LIMIT = 500;

	let units = $state<DraftUnit[]>([]);
	let nextUnitKey = 0;
	let unitDraft = $state('');
	let unitError = $state<string | undefined>(undefined);

	const isCreating = $derived(!value?.id);

	// a run is a pair of numbers at the end of what was typed. Everything before the first of them
	// is the prefix, kept exactly as written — `A1-18` names `A1`, and `A 1-18` names `A 1`, so the
	// notation never inserts a space the reader did not.
	const UNIT_RUN = /^(.*?)(\d+)\s*-\s*(\d+)$/;

	// what one press would add. A run is a way of typing the names rather than something the
	// complex remembers, so it expands here and the names are what is held; anything that is not a
	// run is one unit called what it says.
	const draftRun = $derived.by(() => {
		const draft = unitDraft.trim();

		if (!draft) return { names: [] as string[] };

		const run = UNIT_RUN.exec(draft);

		if (!run) return { names: [draft] };

		const [, prefix, from, to] = run;
		const first = Number(from);
		const last = Number(to);

		if (last < first) return { names: [], error: $LL.complexes.form.unitRangeEndBeforeStart() };

		if (last - first + 1 > RUN_LIMIT) {
			return { names: [], error: $LL.complexes.form.unitRangeTooLarge({ max: RUN_LIMIT }) };
		}

		return {
			names: Array.from({ length: last - first + 1 }, (_, step) => `${prefix}${first + step}`)
		};
	});

	// the first name that is already taken, either by the list it is joining or by an earlier
	// name in its own batch. Compared folded, because the procedure refuses on the same terms.
	function findDuplicate(names: string[], against: string[]) {
		const taken = against.map((name) => name.toLowerCase());

		return names.find((name) => {
			const folded = name.toLowerCase();

			if (taken.includes(folded)) return true;

			taken.push(folded);

			return false;
		});
	}

	function addUnits() {
		const { names, error } = draftRun;

		if (error) {
			unitError = error;

			return;
		}

		if (names.length === 0) return;

		// the same rule the procedure enforces over the arriving set, answered while the user is
		// still holding the names rather than after they submit — and answered against the whole
		// run, which can collide with the list and with itself.
		const duplicate = findDuplicate(
			names,
			units.map((unit) => unit.name)
		);

		if (duplicate !== undefined) {
			unitError = $LL.complexes.form.duplicateUnitName({ name: duplicate });

			return;
		}

		units = [...units, ...names.map((name) => ({ key: nextUnitKey++, name }))];
		unitDraft = '';
		unitError = undefined;
	}

	function removeUnit(key: number) {
		units = units.filter((unit) => unit.key !== key);
		unitError = undefined;
	}

	// the surface is a form, so Enter would submit the complex with the run still sitting
	// unexpanded in the fields.
	function handleEntryKey(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;

		event.preventDefault();
		addUnits();
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
						const names = units.map((unit) => unit.name.trim()).filter(Boolean);
						// renaming after expansion can collide as readily as expanding can, and the
						// reader is better told which name than told that two of them match.
						const duplicate = findDuplicate(names, []);

						if (duplicate !== undefined) {
							unitError = $LL.complexes.form.duplicateUnitName({ name: duplicate });

							return;
						}

						await CreateMutation.mutateAsync({
							...(form.data as Complex),
							units: names.map((name) => ({ name }))
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
			units = [];
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

				<!-- one line: a name, or a run of them. A building of eighteen is one entry rather
				     than eighteen rounds of typing and pressing. -->
				<div class="flex items-center gap-2">
					<Input
						bind:value={unitDraft}
						placeholder={$LL.complexes.form.unitName()}
						class={insetControl}
						aria-invalid={unitError ? 'true' : undefined}
						aria-label={$LL.complexes.form.unitName()}
						aria-describedby="unit-draft-hint"
						onkeydown={handleEntryKey}
					/>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						class="shrink-0"
						aria-label={$LL.common.actions.add()}
						disabled={draftRun.names.length === 0}
						onclick={addUnits}
					>
						<PlusIcon class="size-4" />
					</Button>
				</div>

				<p id="unit-draft-hint" class="text-xs text-muted-foreground">
					{$LL.complexes.form.unitRangeHint()}
				</p>

				{#if unitError}
					<p class="text-sm text-destructive">{unitError}</p>
				{/if}

				{#if units.length === 0}
					<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
						{$LL.complexes.form.noUnitsYet()}
					</p>
				{:else}
					<!-- the rows a contract's units are transferred on, and for the same reason: this is
					     a list whose rows are added and taken away one control at a time. The name is a
					     field rather than text, because the names are what is held and every one a range
					     produced stays the reader's to correct. -->
					<ul class="flex max-h-64 flex-col gap-2 overflow-y-auto pe-1">
						{#each units as unit (unit.key)}
							<li
								class="flex items-center gap-3 rounded-xl bg-muted p-3 transition-colors hover:bg-accent"
							>
								<Input
									bind:value={unit.name}
									aria-label={$LL.complexes.form.unitName()}
									class="h-6 flex-1 rounded-lg bg-transparent px-1 text-sm font-medium hover:bg-transparent"
								/>
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									class="shrink-0"
									aria-label={`${$LL.common.actions.remove()} ${unit.name}`}
									onclick={() => removeUnit(unit.key)}
								>
									<MinusIcon class="size-4" />
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
