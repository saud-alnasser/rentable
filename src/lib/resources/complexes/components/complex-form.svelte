<script lang="ts">
	import { ComplexSchema, type Complex } from '$lib/api/database/schema';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import { useCreateComplex, useUpdateComplex } from '$lib/resources/complexes/hooks/queries';
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
							setError(form, 'name', 'name is associated with a previously registered complex');
						}
					} else {
						toast.error('unexpected error occurred!');
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

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="w-full max-w-sm">
		<form method="POST" use:enhance class="flex flex-col gap-4">
			<Form.Field form={superform} name="name">
				<Form.Control>
					<Label>Name</Label>
					<Input
						bind:value={$form.name}
						placeholder="Name"
						aria-invalid={$errors.name ? 'true' : undefined}
						{...$constraints.name}
					/>
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={superform} name="location">
				<Form.Control>
					<Label>Location</Label>
					<Input
						bind:value={$form.location}
						placeholder="Location"
						aria-invalid={$errors.location ? 'true' : undefined}
						{...$constraints.location}
					/>
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

			<Button
				type="submit"
				disabled={CreateMutation.isPending || UpdateMutation.isPending}
				class="capitalize"
			>
				{value?.id ? 'update' : 'create'}
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
