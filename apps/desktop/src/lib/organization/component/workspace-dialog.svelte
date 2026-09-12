<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import WorkspaceFields from '$lib/organization/component/workspace-fields.svelte';
	import { workspaceFormSchema } from '$lib/organization/workspace-form';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';

	/**
	 * Naming a new workspace, on the shared form surface.
	 *
	 * **Light: one field**, and the weight is what it is rather than what the window is
	 * ([[rules/interface]], *Form surface*). Mounted once in the shell and opened from the rail's
	 * menu and from the organization page; `organization/dialogs.svelte.ts` says why once.
	 *
	 * **The form is the shared one.** The field and the rule it is refused by are
	 * `organization/workspace-form.ts` and `organization/component/workspace-fields.svelte`, the
	 * same pair the no-workspace surface and the first run's last step draw, so a name refused here
	 * is refused there with the same sentence. This surface owns the `superForm` over that schema
	 * and the `<form>` the surface draws; the mutation is the host's, which hands the create back
	 * through `onCreate`, and that is what keeps this renderable in a test with no query client.
	 *
	 * **Drawn for the owner alone.** Creating a workspace needs the Turso authority only the
	 * owner's machine holds; the two openers say so to everybody else, and the shell refuses at the
	 * command regardless.
	 */
	let {
		open,
		onOpenChange,
		isCreating,
		onCreate
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		isCreating: boolean;
		onCreate: (name: string) => void;
	} = $props();

	// built when this component is, past the locale gate, for the reason the factory gives.
	const WorkspaceSchema = workspaceFormSchema($LL);

	let { form, constraints, errors, enhance, reset, ...rest } = superForm(
		defaults(zod4(WorkspaceSchema)),
		{
			SPA: true,
			validators: zod4(WorkspaceSchema),
			onUpdate: ({ form }) => {
				if (!form.valid || isCreating) return;

				onCreate(form.data.name.trim());
			}
		}
	);

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// a fresh open is a fresh name, as every create form here starts blank.
	$effect(() => {
		if (open) {
			reset();
		}
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.layout.workspaceMenu.create()}
>
	<div class="flex flex-col gap-4">
		<WorkspaceFields {superform} disabled={isCreating} class={insetControl} />

		{#if isCreating}
			<!-- the same sentence the no-workspace surface says while it waits: the create reaches
			     turso, and a moment with nothing said reads as a moment with nothing happening. -->
			<p class="text-sm text-muted-foreground" data-workspace-creating>
				{$LL.layout.noWorkspace.creating()}
			</p>
		{/if}
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={isCreating}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isCreating}>
			<PlusIcon class="size-4" />
			{isCreating ? $LL.common.actions.working() : $LL.layout.noWorkspace.create()}
		</Button>
	{/snippet}
</FormSurface>
