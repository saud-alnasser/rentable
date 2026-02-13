<script lang="ts">
	import { TenantSchema, type Tenant } from '$lib/api/database/schema';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import { useCreateTenant, useUpdateTenant } from '$lib/resources/tenants/hooks/queries';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	const TenantFormSchema = TenantSchema.partial({ id: true });
	const CreateMutation = useCreateTenant();
	const UpdateMutation = useUpdateTenant();

	type TenantForm = z.infer<typeof TenantFormSchema>;

	let {
		value,
		open,
		onOpenChange
	}: {
		value?: TenantForm;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<TenantForm>(
		defaults(zod4(TenantFormSchema)),
		{
			SPA: true,
			validators: zod4(TenantFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				if (value && form.data.id) {
					const unchanged =
						value.name === form.data.name &&
						value.nationalId === form.data.nationalId &&
						value.phone === form.data.phone;

					if (unchanged) {
						onOpenChange(false);

						return;
					}
				}

				const mutation = form.data.id ? UpdateMutation : CreateMutation;

				try {
					await mutation.mutateAsync(form.data as Tenant);

					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (e.message.includes('national id')) {
							setError(form, 'nationalId', 'national id is associated with a registered tenant');
						} else if (e.message.includes('phone')) {
							setError(form, 'phone', 'phone is associated with a registered tenant');
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
			<Form.Field form={superform} name="nationalId">
				<Form.Control>
					<Label>National ID</Label>
					<Input
						bind:value={$form.nationalId}
						placeholder="National ID"
						aria-invalid={$errors.nationalId ? 'true' : undefined}
						{...$constraints.nationalId}
					/>
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

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

			<Form.Field form={superform} name="phone">
				<Form.Control>
					<Label>Phone</Label>
					<Input
						bind:value={$form.phone}
						placeholder="Phone (+966...)"
						aria-invalid={$errors.phone ? 'true' : undefined}
						{...$constraints.phone}
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
