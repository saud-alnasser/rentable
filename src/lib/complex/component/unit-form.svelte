<script lang="ts">
	import { UnitSchema, type Unit } from '$lib/platform/database/schema';
	import { Button } from '$lib/design/primitive/button';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateUnit, useUpdateUnit } from '$lib/complex/query';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	const UnitFormSchema = UnitSchema.partial({ id: true, complexId: true, status: true });
	const CreateMutation = useCreateUnit();
	const UpdateMutation = useUpdateUnit();

	type UnitForm = z.infer<typeof UnitFormSchema>;

	let {
		value,
		open,
		onOpenChange,
		complexId
	}: {
		value?: UnitForm;
		open: boolean;
		onOpenChange: (value: boolean) => void;
		complexId: number;
	} = $props();

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<UnitForm>(
		defaults(zod4(UnitFormSchema)),
		{
			SPA: true,
			validators: zod4(UnitFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				if (value && form.data.id) {
					const unchanged = value.name === form.data.name;

					if (unchanged) {
						onOpenChange(false);

						return;
					}
				}

				const mutation = form.data.id ? UpdateMutation : CreateMutation;

				try {
					await mutation.mutateAsync({
						...form.data,
						complexId
					} as Unit);

					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (e.message.includes('name')) {
							setError(form, 'name', $LL.complexes.units.duplicateName());
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
			if (value) {
				form.set(value);
			} else {
				reset();
			}
		}
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="light" title={$LL.common.labels.unit()}>
	<div class="flex flex-col gap-4 rounded-2xl border bg-muted p-4">
		<Form.Field form={superform} name="name" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.labels.name()}</Form.Label>
				<Input
					bind:value={$form.name}
					placeholder={$LL.common.labels.name()}
					aria-invalid={$errors.name ? 'true' : undefined}
					{...$constraints.name}
				/>
			</Form.Control>
			<FieldError />
		</Form.Field>
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
