<script lang="ts">
	import { UnitSchema, type Unit } from '$lib/api/database/schema';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import { useCreateUnit, useUpdateUnit } from '$lib/resources/units/hooks/queries';
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
							setError(form, 'name', 'name is associated with a unit in the same complex');
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
