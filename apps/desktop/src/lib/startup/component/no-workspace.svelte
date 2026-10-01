<script lang="ts">
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { WayInPreferences } from '$lib/settings/ui';
	import { WorkspaceFields } from '$lib/workspace/ui';
	import { workspaceFormSchema } from '$lib/workspace';
	import { tick } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';

	/**
	 * A member who is in, with nowhere to go yet.
	 *
	 * An organization whose owner has not created a workspace yet admits its members to nothing
	 * behind the wall, and this is what it draws: the organization's name, a sentence saying so, and
	 * the one way past it, which is the owner's. **The form is drawn for the owner and a sentence
	 * for everybody else**, because creating a workspace needs the Turso authority only the owner's
	 * machine holds; the shell refuses anybody else at the command regardless, and this is the
	 * screen saying the same thing before they press anything.
	 *
	 * **The form is the shared one.** The name field and the rule it is refused by are
	 * `workspace/form.ts` and `workspace/component/fields.svelte`, the
	 * same pair the first run's last step and the new-workspace dialog draw, so a name refused here
	 * is refused there with the same sentence. This surface owns the `superForm` over that schema
	 * and nothing else: the mutation stays in the root layout, which hands the result of a create
	 * back through `onCreate`, and that is what keeps this renderable in a test with no provider.
	 *
	 * **The last step of the way in** (effort 843, requirements 1, 3 and 8): on the way-in surface,
	 * under the mark, with one prominent "create workspace" for the owner, the field with no glyph
	 * and the cursor in it on arrival, and the language and appearance control at the foot. Over
	 * every address, because there is no workspace for any address to draw from.
	 */
	let {
		organizationName,
		canCreate,
		isCreating,
		onCreate
	}: {
		organizationName: string;
		/** whether the person is the owner, which is who a create is for. */
		canCreate: boolean;
		isCreating: boolean;
		onCreate: (name: string) => void;
	} = $props();

	// built when this component is, past the locale gate, for the reason the factory gives.
	const WorkspaceSchema = workspaceFormSchema($LL);

	let { form, constraints, errors, enhance, ...rest } = superForm(defaults(zod4(WorkspaceSchema)), {
		// named apart from the walk's and the dialog's forms off the same schema (see `setup-walk`).
		id: 'startup-workspace',
		SPA: true,
		validators: zod4(WorkspaceSchema),
		onUpdate: ({ form }) => {
			if (!form.valid || !canCreate || isCreating) return;

			onCreate(form.data.name.trim());
		}
	});

	const superform = { form, constraints, errors, enhance, ...rest };

	// arriving puts the owner's cursor in the name (requirement 8); the field is drawn once per
	// arrival, so this runs once.
	let nameField = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!nameField) return;

		void tick().then(() => nameField?.focus());
	});
</script>

<WayInSurface
	step="no-workspace"
	title={$LL.layout.noWorkspace.title()}
	description={$LL.layout.noWorkspace.description()}
	busy={isCreating}
>
	<div class="flex flex-col gap-4">
		<p class="text-center text-sm font-medium" data-no-workspace-organization>
			<bdi>{organizationName}</bdi>
		</p>

		{#if canCreate}
			<form method="POST" use:enhance class="flex flex-col gap-4">
				<WorkspaceFields
					{superform}
					disabled={isCreating}
					glyph={false}
					class="h-9"
					bind:input={nameField}
				/>

				<Button type="submit" size="lg" class="w-full" disabled={isCreating}>
					<span class="first-letter:uppercase">
						{isCreating ? $LL.common.actions.working() : $LL.layout.noWorkspace.create()}
					</span>
				</Button>
			</form>

			{#if isCreating}
				<p class="text-center text-sm text-muted-foreground">{$LL.layout.noWorkspace.creating()}</p>
			{/if}
		{:else}
			<p class="text-center text-sm text-muted-foreground">{$LL.layout.noWorkspace.ownerOnly()}</p>
		{/if}
	</div>

	{#snippet foot()}
		<WayInPreferences />
	{/snippet}
</WayInSurface>
