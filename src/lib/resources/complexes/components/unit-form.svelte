<script lang="ts">
	import { UnitSchema, type Unit } from '$lib/api/database/schema';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateUnit, useUpdateUnit } from '$lib/resources/complexes/hooks/queries';
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

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="w-full sm:max-w-md">
		<form method="POST" use:enhance class="flex flex-col">
			<Dialog.Header>
				<Dialog.Title class="capitalize">{$LL.common.labels.unit()}</Dialog.Title>
			</Dialog.Header>

			<div class="px-6 py-5">
				<div
					class="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/25 p-4 backdrop-blur-sm"
				>
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
				</div>

				<Form.ErrorsSummary errors={$errors} class="mt-4" />
			</div>

			<Dialog.Footer>
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
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
