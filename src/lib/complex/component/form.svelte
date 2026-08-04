<script lang="ts">
	import { ComplexSchema, type Complex } from '$lib/platform/database/schema';
	import { Button } from '$lib/design/primitive/button';
	import FormSurface from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateComplex, useUpdateComplex } from '$lib/complex/query';
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
		value?: ComplexForm;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

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

				const mutation = form.data.id ? UpdateMutation : CreateMutation;

				try {
					await mutation.mutateAsync(form.data as Complex);

					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (e.message.includes('name')) {
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
			if (value) {
				form.set(value);
			} else {
				reset();
			}
		}
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="light" title={$LL.common.labels.complex()}>
	<div class="flex flex-col gap-4 rounded-2xl border bg-muted p-4">
		<Form.Field form={superform} name="name">
			<Form.Control>
				<Form.Label>{$LL.common.labels.name()}</Form.Label>
				<Input
					bind:value={$form.name}
					placeholder={$LL.common.labels.name()}
					aria-invalid={$errors.name ? 'true' : undefined}
					{...$constraints.name}
				/>
			</Form.Control>
			<Form.Description />
		</Form.Field>

		<Form.Field form={superform} name="location">
			<Form.Control>
				<Form.Label>{$LL.common.labels.location()}</Form.Label>
				<Input
					bind:value={$form.location}
					placeholder={$LL.common.labels.location()}
					aria-invalid={$errors.location ? 'true' : undefined}
					{...$constraints.location}
				/>
			</Form.Control>
			<Form.Description />
		</Form.Field>
	</div>

	<Form.ErrorsSummary errors={$errors} class="mt-4" />

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
