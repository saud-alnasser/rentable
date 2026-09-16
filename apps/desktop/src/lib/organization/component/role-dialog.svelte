<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		ADMINISTRATION_BY_ROLE,
		EVERY_ADMINISTRATION,
		maskOf,
		permits,
		type Administration
	} from '@rentable/workspace-permission';
	import ShieldIcon from '@lucide/svelte/icons/shield';

	/**
	 * What a member is called, and what they may actually do.
	 *
	 * **Light: a choice and a list of checkboxes**, and the weight is what the form is rather
	 * than what the window is ([[rules/interface]], *Form surface*). Opened from the member's own
	 * row, for a reader whose row carries `changeRole`, and never on the owner's row or their
	 * own; Rust refuses both again on the signed row.
	 *
	 * **The role sets the acts; the acts are the truth** (requirement 6 of effort 826). A role is
	 * a bundle a person is created with and the one word the list calls them, so picking one
	 * fills the checkboxes in and leaves them editable, and what is written is whatever the boxes
	 * say when the form is submitted.
	 *
	 * **Giving somebody an act that signs a row is the owner's alone**, because only the owner's
	 * vault derives the key that certifies a signer. Six of the seven acts sign; `renameWorkspace`
	 * writes the sealed name outside the signature and is the one that does not. So for a caller
	 * who is not the owner, an act the member does not already hold is drawn refused rather than
	 * hidden, with the sentence naming the owner: narrowing anybody is theirs, widening is not.
	 * *The list of what signs is stated here and in `organization/permission.rs`; the package
	 * carries the acts and not which of them signs.*
	 *
	 * **The mutation is the caller's.** This owns the surface and what is chosen on it, and hands
	 * the pair up through `onSave`, which resolves when the row was written and rejects with what
	 * the shared handler has already said.
	 */
	let {
		open,
		onOpenChange,
		username,
		role,
		permissions,
		canGrantSigning,
		isSaving,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the member whose row this writes, named in the description. */
		username: string;
		/** the role their row carries now. The owner's row never opens this. */
		role: string;
		/** the permission value their row carries now. */
		permissions: number;
		/** whether the reader is the owner, which is who may hand out an act that signs a row. */
		canGrantSigning: boolean;
		isSaving: boolean;
		onSave: (role: 'administrator' | 'member', permissions: number) => void;
	} = $props();

	/**
	 * the one act of the seven that signs nothing: `renameWorkspace` writes the sealed workspace
	 * name outside the signature, so a member holding it needs no certificate and any holder of
	 * `changeRole` can hand it out.
	 */
	const SIGNS_NOTHING: Administration = 'renameWorkspace';

	let chosenRole = $state<'administrator' | 'member'>('member');
	let chosen = $state<number>(0);

	// a fresh open starts on what the row holds, with nothing left over from the last member.
	$effect(() => {
		if (open) {
			chosenRole = role === 'administrator' ? 'administrator' : 'member';
			chosen = permissions;
		}
	});

	/** the acts this reader may not add to this member: the signing ones they do not already hold. */
	const refused = $derived(
		canGrantSigning
			? []
			: EVERY_ADMINISTRATION.filter((act) => act !== SIGNS_NOTHING && !permits(permissions, act))
	);

	const roleLabel = (value: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[value] ?? value;

	const actLabel = (act: Administration) =>
		({
			inviteMember: $LL.organization.dashboard.actInviteMember(),
			removeMember: $LL.organization.dashboard.actRemoveMember(),
			changeRole: $LL.organization.dashboard.actChangeRole(),
			renameWorkspace: $LL.organization.dashboard.actRenameWorkspace(),
			resetPassword: $LL.organization.dashboard.actResetPassword(),
			renameMember: $LL.organization.dashboard.actRenameMember(),
			grantWorkspace: $LL.organization.dashboard.actGrantWorkspace()
		})[act];

	const toggle = (act: Administration, checked: boolean) => {
		chosen = checked ? chosen + maskOf(act) : chosen - maskOf(act);
	};

	// picking a role fills the boxes in with what that role is created with, and leaves them
	// editable: the column is still what the member may do.
	const pickRole = (value: string) => {
		if (value !== 'administrator' && value !== 'member') return;

		chosenRole = value;
		chosen = ADMINISTRATION_BY_ROLE[value];
	};

	const enhance = onSubmit(() => {
		if (isSaving) return;

		onSave(chosenRole, chosen);
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.organization.dashboard.changeRoleTitle()}
	description={$LL.organization.dashboard.changeRoleDescription({ username })}
>
	<div class="flex flex-col gap-4" data-role-form>
		<Field.Field>
			<Field.Label for="member-role">{$LL.organization.dashboard.role()}</Field.Label>
			<Select.Root type="single" value={chosenRole} onValueChange={pickRole} disabled={isSaving}>
				<Select.Trigger id="member-role" class={cn('w-full capitalize', insetControl)}>
					{roleLabel(chosenRole)}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="member" label={roleLabel('member')} class="capitalize">
						{roleLabel('member')}
					</Select.Item>
					<!-- an administrator carries every act, six of which sign, so for anybody but the
					     owner the role is drawn refused rather than hidden. -->
					<Select.Item
						value="administrator"
						label={roleLabel('administrator')}
						class="capitalize"
						disabled={refused.length > 0}
					>
						{roleLabel('administrator')}
					</Select.Item>
					<!-- the owner's row is never opened here, and owner is not a role this writes:
					     the word is the list's. Ownership is handed over by its own act, on the
					     owner's own card (effort 828, requirement 22), because it moves a key and
					     two rows rather than a value on one. -->
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Set>
			<Field.Legend>{$LL.organization.dashboard.permissionsLegend()}</Field.Legend>
			{#each EVERY_ADMINISTRATION as act (act)}
				<Field.Field orientation="horizontal" data-act={act}>
					<Checkbox
						id={`act-${act}`}
						checked={permits(chosen, act)}
						onCheckedChange={(checked) => toggle(act, checked === true)}
						disabled={isSaving || refused.includes(act)}
					/>
					<Field.Label for={`act-${act}`}>{actLabel(act)}</Field.Label>
				</Field.Field>
			{/each}
			{#if refused.length > 0}
				<Field.Description data-role-refusal>
					{$LL.organization.dashboard.signingIsTheOwners()}
				</Field.Description>
			{/if}
		</Field.Set>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving}>
			<ShieldIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
