<script lang="ts" module>
	/** what the sheet hands back on a save: the name, the role, the override, and the grants that changed. */
	export type MemberEdit = {
		/** the username, trimmed; the one they hold where the reader may not rename them. */
		username: string;
		roleId: string;
		override: number;
		changes: { id: string; access: AccessChoice }[];
	};
</script>

<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { lacking } from '$lib/organization/acts';
	import type { AccessChoice } from '$lib/organization/component/access-dialog.svelte';
	import MemberOverride from '$lib/organization/component/member-override.svelte';
	import MemberRole from '$lib/organization/component/member-role.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import MemberWorkspaces, {
		type MemberWorkspaceRow
	} from '$lib/organization/component/member-workspaces.svelte';
	import { firstUnheldMoved, flagPhrase, roleNameOf } from '$lib/organization/role';
	import { usernameSchema } from '$lib/organization/username-form';
	import type { OrganizationRole } from '$lib/platform/host';
	import { effective } from '@rentable/workspace-permission';
	import SaveIcon from '@lucide/svelte/icons/save';
	import UserIcon from '@lucide/svelte/icons/user';

	/**
	 * One member, on one surface: what they are called, the role they hold, what is changed for
	 * them alone, and the workspaces they hold.
	 *
	 * **Heavy: the edge panel** ([[rules/interface]], *Form surface*), and the weight is what the
	 * form is rather than what the window is. Opened from a member's card, by its address or its
	 * edit entry, and never on the owner's card; Rust refuses every section again on the signed
	 * row. *It was two dialogs, a role with seven checkboxes and a list of workspaces, until effort
	 * 828, requirement 23 made them one surface; it opened as the centred panel until the human saw
	 * it in the running build.*
	 *
	 * **It reads as a directory: a tray on top, records below** (the human's second look). The
	 * tray carries the role, which is the one choice about the whole person, with the sentence that
	 * role means under it. Under the tray sit the lists: what the member may do, as switches, and
	 * the workspaces they hold. *The save stays in the surface's own footer, where every write here
	 * keeps it.*
	 *
	 * **The role, what they may do and the workspaces are always drawn** (effort 838, requirement
	 * 12): they are what the card is for, read even by somebody who may change none of them. A
	 * control the reader may not use is refused with its reason, the flag they lack, rather than
	 * taken away. The name is drawn for whoever may write it, as before (effort 826, requirement
	 * 15). *The workspaces were drawn for whoever held `grantWorkspace` alone until ticket 48 of
	 * effort 838 made each one a switch, refused with its reason like the rest.*
	 *
	 * **Picking another role makes them that role exactly** (requirement 6 as amended
	 * 2026-09-27): what was changed for them was changed against the old role, and the shell's
	 * assignRole clears it the same way. The switches read the new role at once, and anything
	 * changed after the pick rides with it as one act. Picking the role their row names again puts
	 * back what was changed for them, since nothing about them has changed. **A role whose pick
	 * would move a flag the reader does not hold is refused in the list, naming the flag**
	 * (requirement 7): what the member ends up with before and after is what Rust asks the reader
	 * to hold every difference of.
	 *
	 * **The name is a section of this surface, not a surface of its own** (effort 832, requirement
	 * 6), under the one schema in `organization/username-form.ts`. Whether a username is taken is
	 * Rust's alone, and that refusal marks the name the way the others mark their sections.
	 *
	 * **One save runs the acts that exist**, each only where something changed, and each refuses on
	 * its own section ([[rules/interface]], *Validation errors*); a role and an override changed
	 * together are one act, and its refusal marks both.
	 *
	 * **Its sections are the ones the sheet that adds a member draws** (ticket 42 of effort 832):
	 * `member-role.svelte`, `member-override.svelte` and `member-workspaces.svelte`, so adding a
	 * member and editing one read as one surface in two moments.
	 *
	 * **The mutations are the caller's.** This owns the surface and what is chosen on it, and hands
	 * them up through `onSave`.
	 */
	let {
		open,
		onOpenChange,
		username,
		roleId,
		override,
		roles,
		rows,
		readerRank,
		readerPermissions,
		canRename,
		canAssignRole,
		canOverride,
		canGrantWorkspace,
		canGrantReadOnly,
		isSaving,
		nameRefusal,
		roleRefusal,
		overrideRefusal,
		workspacesRefusal,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the member whose row this writes, named in the description and opening the name field. */
		username: string;
		/** the role their row names now. The owner's row never opens this. */
		roleId: string;
		/** the flags switched for them alone now. */
		override: number;
		/** every role the organization has, which is what the tray chooses among. */
		roles: readonly OrganizationRole[];
		/** every workspace a grant can be held on, with what this member holds on it today. */
		rows: MemberWorkspaceRow[];
		/** how high the reader's role stands: a role at or above it is not theirs to give. */
		readerRank: number;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		readerPermissions: number;
		/** `renameMember`: the name. */
		canRename: boolean;
		/** `assignRole`: the role. */
		canAssignRole: boolean;
		/** `overrideMember`: what is changed for them alone. */
		canOverride: boolean;
		/** `grantWorkspace`: the workspaces. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner, which is who mints a read only credential. */
		canGrantReadOnly: boolean;
		isSaving: boolean;
		/** what the rename was refused with, or `null`. */
		nameRefusal: string | null;
		/** what the role was refused with, or `null`. */
		roleRefusal: string | null;
		/** what the override was refused with, or `null`. */
		overrideRefusal: string | null;
		/** what the grants were refused with, or `null`. */
		workspacesRefusal: string | null;
		onSave: (edit: MemberEdit) => void;
	} = $props();

	let chosenName = $state('');
	/** what the name field was refused with here, before anything was written. */
	let nameInvalid = $state<string | null>(null);
	let chosenRole = $state('');
	let chosenOverride = $state(0);
	let access = $state<Record<string, AccessChoice>>({});

	// a fresh open starts on what the row holds, with nothing left over from the last member.
	$effect(() => {
		if (open) {
			chosenName = username;
			nameInvalid = null;
			chosenRole = roleId;
			chosenOverride = override;
			access = Object.fromEntries(rows.map((row) => [row.id, row.access]));
		}
	});

	const chosen = $derived(roles.find((role) => role.id === chosenRole) ?? null);
	const roleMask = $derived(chosen?.mask ?? 0);
	const roleName = $derived(chosen ? roleNameOf($LL, chosen) : '');

	/** what the member ends up with on the row, which a pick is measured from. */
	const savedEffective = $derived(
		effective(roles.find((role) => role.id === roleId)?.mask ?? 0, override)
	);

	/** why picking a role would be refused for a flag the reader does not hold, or `null`. */
	const pickRefusal = (role: OrganizationRole) => {
		if (role.id === roleId) return null;

		const flag = firstUnheldMoved(readerPermissions, savedEffective, role.mask);

		return flag ? $LL.organization.foreseen.roleMoves({ flag: flagPhrase($LL, flag) }) : null;
	};

	const pickAccess = (id: string, value: AccessChoice) => {
		access[id] = value;
	};

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the message resolves against a locale.
	const nameSchema = usernameSchema($LL);

	/** the name as it would be written, or `null` with the sentence it is refused with marked. */
	const checkName = () => {
		const parsed = nameSchema.safeParse(chosenName);

		nameInvalid = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);

		return parsed.success ? parsed.data : null;
	};

	const nameError = $derived(nameInvalid ?? nameRefusal);

	const enhance = onSubmit(() => {
		if (isSaving) return;

		// the name is checked only where it is this reader's to write; anybody else hands back the
		// one the member holds, which is no change.
		const name = canRename ? checkName() : username;

		if (name === null) return;

		onSave({
			username: name,
			roleId: chosenRole,
			override: chosenOverride,
			changes: rows
				.filter((row) => (access[row.id] ?? row.access) !== row.access)
				.map((row) => ({ id: row.id, access: access[row.id] ?? row.access }))
		});
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.common.actions.edit()}
	description={$LL.organization.dashboard.memberSheetDescription({ username })}
>
	<div class="flex flex-col gap-6" data-member-sheet>
		{#if canRename}
			<!-- what they are called, first: it is who the rest of the sheet is about. -->
			<Field.Set class="gap-3" aria-labelledby="member-name-legend" data-sheet-section="name">
				<MemberSectionHead
					id="member-name"
					legend={$LL.organization.dashboard.username()}
					description={$LL.organization.dashboard.renameDescription()}
				/>

				<InputGroup.Root class={insetControl} data-disabled={isSaving || undefined}>
					<InputGroup.Addon>
						<UserIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						name="username"
						autocomplete="off"
						aria-labelledby="member-name-legend"
						bind:value={chosenName}
						placeholder={$LL.organization.dashboard.username()}
						disabled={isSaving}
						aria-invalid={nameError ? 'true' : undefined}
						onfocusout={() => {
							if (chosenName !== username) checkName();
						}}
					/>
				</InputGroup.Root>

				{#if nameError}
					<Field.Error data-sheet-error="name">{nameError}</Field.Error>
				{/if}
			</Field.Set>
		{/if}

		<MemberRole
			id="member-role"
			{roles}
			value={chosenRole}
			onPick={(next) => {
				// a member given another role is that role exactly, as the shell's assignRole
				// leaves them: what was changed for them was changed against the old one. Their
				// own role again is them as they are.
				if (next === roleId) chosenOverride = override;
				else if (next !== chosenRole) chosenOverride = 0;
				chosenRole = next;
			}}
			{readerRank}
			refusalOf={pickRefusal}
			custom={chosenOverride !== 0}
			refusal={canAssignRole ? null : lacking($LL, 'assignRole')}
			disabled={isSaving}
			error={roleRefusal}
		/>

		<MemberOverride
			id="member-override"
			{roleMask}
			{roleName}
			bind:override={chosenOverride}
			held={readerPermissions}
			refusal={canOverride ? null : lacking($LL, 'overrideMember')}
			disabled={isSaving}
			error={overrideRefusal}
		/>

		<MemberWorkspaces
			id="workspaces"
			rowPrefix="access"
			description={$LL.organization.dashboard.accessTakenBack()}
			empty={$LL.organization.dashboard.noWorkspaces()}
			{rows}
			{access}
			onPick={pickAccess}
			{canGrantReadOnly}
			refusal={canGrantWorkspace ? null : lacking($LL, 'grantWorkspace')}
			disabled={isSaving}
			error={workspacesRefusal}
		/>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving}>
			<SaveIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
