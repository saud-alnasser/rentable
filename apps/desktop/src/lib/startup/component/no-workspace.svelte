<script lang="ts">
	import type { HeldOrganization } from '$lib/organization';
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { OrganizationLockedNotice, OrganizationSwitcher } from '$lib/organization/ui';
	import { WayInPreferences } from '$lib/settings/ui';
	import { WorkspaceFields } from '$lib/workspace/ui';
	import { workspaceFormSchema } from '$lib/workspace';
	import { tick } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import WaysIn from './ways-in.svelte';

	/**
	 * A member who is in, with nowhere to go yet.
	 *
	 * An organization whose owner has not created a workspace yet admits its members to nothing
	 * behind the wall, and this is what it draws: the organization switcher, a sentence saying so,
	 * and the one way past it, which is the owner's. **The form is drawn for the owner and a sentence
	 * for everybody else**, because creating a workspace needs the Turso authority only the owner's
	 * machine holds; the shell refuses anybody else at the command regardless, and this is the
	 * screen saying the same thing before they press anything.
	 *
	 * **The switcher heads it, for the owner and every other member** (effort 851, requirement 7),
	 * in place of the organization's name, which it carries: a member who is in and has nowhere to
	 * go can switch to another organization, add one or remove one, rather than being stuck here.
	 * Choosing or adding signs out first, since switching happens signed out (requirement 8), and is
	 * the root layout's; removing another organization leaves this one signed in. "Add
	 * organization" turns the screen into the add step, the welcome's two ways in with back to
	 * here, as the wall does. None of it can be used while a workspace is being created.
	 *
	 * **A locked member reads the locked sentence here, as the shell says it** (effort 851,
	 * requirement 32, ticket 16): with no workspace they never reach the shell's `notice` place, so
	 * the same notice stands under the switcher, the organization it is about, and above whatever
	 * the step offers. It reads the session itself and is gone once the session reads unlocked.
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
	 * every address but the two walks, because there is no workspace for any address to draw from.
	 */
	let {
		organizations,
		selected,
		canCreate,
		isCreating,
		onCreate,
		onSelect,
		onRemove,
		onSetUpOrganization,
		onJoinByLink
	}: {
		/** every organization this machine holds, which the switcher lists. */
		organizations: HeldOrganization[];
		/** the id of the organization this member is in, as the record selects it. */
		selected: string | null;
		/** whether the person is the owner, which is who a create is for. */
		canCreate: boolean;
		isCreating: boolean;
		onCreate: (name: string) => void;
		/** another held organization was chosen at the switcher: sign out, and put its wall up. */
		onSelect: (organizationId: string) => void;
		/** forget one held organization, once confirmed; a refusal it throws stays in the confirm. */
		onRemove: (organizationId: string) => Promise<void> | void;
		/** set up another organization from the add step: sign out, and go to the walk. */
		onSetUpOrganization: () => void;
		/** join another organization by a link from the add step: sign out, and go to the join. */
		onJoinByLink: () => void;
	} = $props();

	/** whether the switcher's "add organization" turned the screen into the add step. */
	let isAdding = $state(false);

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
	step={isAdding ? 'add' : 'no-workspace'}
	title={isAdding ? $LL.organization.switcher.addTitle() : $LL.layout.noWorkspace.title()}
	description={isAdding ? undefined : $LL.layout.noWorkspace.description()}
	back={isAdding
		? { label: $LL.organization.switcher.back(), onclick: () => (isAdding = false) }
		: undefined}
	busy={isCreating}
>
	{#if isAdding}
		<WaysIn {onSetUpOrganization} {onJoinByLink} />
	{:else}
		<div class="flex flex-col gap-4">
			<div data-no-workspace-organization>
				<OrganizationSwitcher
					{organizations}
					{selected}
					disabled={isCreating}
					{onSelect}
					onAdd={() => (isAdding = true)}
					{onRemove}
				/>
			</div>

			<OrganizationLockedNotice framed={false} />

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
					<p class="text-center text-sm text-muted-foreground">
						{$LL.layout.noWorkspace.creating()}
					</p>
				{/if}
			{:else}
				<p class="text-center text-sm text-muted-foreground">
					{$LL.layout.noWorkspace.ownerOnly()}
				</p>
			{/if}
		</div>
	{/if}

	{#snippet foot()}
		<WayInPreferences />
	{/snippet}
</WayInSurface>
