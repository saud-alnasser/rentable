<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useRenameOrganization } from '$lib/organization/query';
	import { ORGANIZATION_NAME_LIMIT } from '$lib/organization/setup/setup';
	import SaveIcon from '@lucide/svelte/icons/save';
	import { surfaceForm } from '$lib/form';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * What the organization is called, changed by its owner (effort 851, requirements 22 to 25).
	 *
	 * **The workspace's rename form, for the organization** (`workspace/component/rename-form.svelte`):
	 * the shared form surface at its light weight, one field, titled for the act that opens it, and
	 * an unchanged name closing it with no write. A rename is a write, and [[rules/interface]] under
	 * *Form surface* puts every write on this component whatever its size.
	 *
	 * **The rules are the walk's, and so are the sentences** (requirement 23): trimmed, not empty,
	 * not past `ORGANIZATION_NAME_LIMIT`, refused on the field the owner typed in with the two
	 * sentences the walk's name step says. The procedure refuses them again and so does Rust, which
	 * is what stores the name; this is the only one of the three that can mark the field.
	 */
	let {
		name,
		open,
		onOpenChange
	}: {
		/** the organization's name as the session reads it. */
		name: string;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	const renameMutation = useRenameOrganization();

	// built here rather than at module load, and plain rather than derived, for the reason the
	// workspace's rename form gives: the messages resolve against a locale, and `superForm` takes
	// its validators once.
	const RenameSchema = z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: $LL.organization.setup.nameRequired() })
			.max(ORGANIZATION_NAME_LIMIT, { message: $LL.organization.setup.nameTooLong() })
	});

	type RenameForm = z.infer<typeof RenameSchema>;

	let { form, constraints, errors, enhance, ...rest } = superForm<RenameForm>(
		defaults(zod4(z.object({ name: z.string() }))),
		{
			...surfaceForm,
			validators: zod4(RenameSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				// unchanged is not a write: saving the name it already has closes the surface rather
				// than spending a round trip, a signature and a push on nothing.
				if (form.data.name.trim() === name) {
					onOpenChange(false);

					return;
				}

				try {
					await renameMutation.mutateAsync({ name: form.data.name.trim() });
					onOpenChange(false);
				} catch {
					// the shared error handler has already said what went wrong. The surface stays open
					// on what was typed, since what reaches here is retried: a session that closed, a
					// write the shell could not make.
				}
			}
		}
	);

	$effect(() => {
		if (open) {
			form.set({ name });
		}
	});

	const superform = { form, constraints, errors, enhance, ...rest };
</script>

<!-- light: one field. Titled edit, the act that opens it ([[rules/interface]], *Edit*). -->
<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.common.actions.edit()}
	description={$LL.organization.name.renameDescription()}
>
	<Form.Field form={superform} name="name" class="group relative">
		<Form.Control>
			<Form.Label>{$LL.common.labels.name()}</Form.Label>
			<Input
				bind:value={$form.name}
				placeholder={$LL.common.labels.name()}
				class={insetControl}
				aria-invalid={$errors.name ? 'true' : undefined}
				data-organization-name-field
				{...$constraints.name}
			/>
		</Form.Control>
		<FieldError />
	</Form.Field>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={renameMutation.isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every submit carries one. -->
		<Button type="submit" disabled={renameMutation.isPending} class="capitalize">
			<SaveIcon class="size-4" />
			{$LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
