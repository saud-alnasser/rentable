<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useRenameWorkspace } from '$lib/settings/query';
	import { WORKSPACE_NAME_LIMIT } from '$lib/workspace/workspace';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * What this workspace is called.
	 *
	 * **The shared form surface rather than an input in place of the name on the row.** A rename is
	 * a write, and [[rules/interface]] under *Form surface* puts a surface that writes on this
	 * component whatever its size — so one field is light rather than something else.
	 *
	 * **The three names the control plane will not store are refused here first**, on the field the
	 * reader typed in. It refuses them too, and so does the procedure between them; what is
	 * different about this one is that it is the only one whose answer a person can act on without
	 * a round trip, and the only one that can mark the control they are looking at.
	 */
	let {
		workspace,
		open,
		onOpenChange
	}: {
		workspace: { name: string };
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	const renameMutation = useRenameWorkspace();

	// **Built here rather than at module load, and plain rather than derived.** At module load the
	// messages would be resolved before a locale was, which is the empty string; derived, they
	// would be recomputed and thrown away, because `superForm` takes its validators once and a
	// later value never reaches it. What is left is the honest thing: the schema is built when this
	// component is, which is inside the shell and past the locale gate, and a reader who changes
	// the language is on a different page while they do it.
	const RenameSchema = z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: $LL.workspace.nameRequired() })
			.max(WORKSPACE_NAME_LIMIT, { message: $LL.workspace.nameTooLong() })
	});

	type RenameForm = z.infer<typeof RenameSchema>;

	let { form, constraints, errors, enhance, ...rest } = superForm<RenameForm>(
		defaults(zod4(z.object({ name: z.string() }))),
		{
			SPA: true,
			validators: zod4(RenameSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				// unchanged is not a write. Pressing save on the name it already has should close the
				// surface rather than spend a round trip announcing that nothing happened.
				if (form.data.name.trim() === workspace.name) {
					onOpenChange(false);

					return;
				}

				try {
					await renameMutation.mutateAsync({ name: form.data.name.trim() });
					onOpenChange(false);
				} catch {
					// the shared error handler has already said what went wrong. The surface stays open
					// on what they typed, because the failures that reach here are the ones a person
					// retries: an unreachable control plane, a session that closed.
				}
			}
		}
	);

	$effect(() => {
		if (open) {
			form.set({ name: workspace.name });
		}
	});

	const superform = { form, constraints, errors, enhance, ...rest };
</script>

<!-- light: one field, and the weight is what it is rather than what the window is. -->
<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.workspace.rename()}
	description={$LL.workspace.renameDescription()}
>
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

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={renameMutation.isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={renameMutation.isPending} class="capitalize">
			{$LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
