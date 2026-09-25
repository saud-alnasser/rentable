<script lang="ts" module>
	/** what the sheet hands back on a save: the name, the role, the acts, and the grants that changed. */
	export type MemberEdit = {
		/** the username, trimmed; the one they hold where the reader may not rename them. */
		username: string;
		role: 'administrator' | 'member';
		permissions: number;
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
	import type { AccessChoice, AccessRow } from '$lib/organization/component/access-dialog.svelte';
	import MemberActs from '$lib/organization/component/member-acts.svelte';
	import MemberRole from '$lib/organization/component/member-role.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import MemberWorkspaces from '$lib/organization/component/member-workspaces.svelte';
	import { usernameSchema } from '$lib/organization/username-form';
	import { ADMINISTRATION_BY_ROLE } from '@rentable/workspace-permission';
	import SaveIcon from '@lucide/svelte/icons/save';
	import UserIcon from '@lucide/svelte/icons/user';

	/**
	 * One member, on one surface: what they are called, what else they may do, and the workspaces
	 * they hold.
	 *
	 * **Heavy: the edge panel** ([[rules/interface]], *Form surface*), and the weight is what the
	 * form is rather than what the window is. Opened from a member's card, by its address or its
	 * edit entry, and never on the owner's card or the reader's own; Rust refuses both again on
	 * the signed row. *It was two dialogs, a role with seven checkboxes and a list of workspaces,
	 * reached from two entries of one menu; effort 828, requirement 23 made them one surface, on
	 * the human's word that one person's standing was split across two. It opened as the centred
	 * panel until the human saw it in the running build: this is a person's whole standing read
	 * beside the directory it was opened from, which is what the heavy weight is for.*
	 *
	 * **It reads as a directory: a tray on top, records below** (the human's second look). The
	 * tray carries the role, which is the one choice about the whole person, with the sentence
	 * that role means under it. Under the tray sit two lists, each with its own head and its own
	 * control where it has one: what this member is also allowed, and the workspaces they hold.
	 * So the eye meets the same shape here as in the members and workspaces directories rather
	 * than a column of headings floating in a form. *The save stays in the surface's own footer,
	 * where every write here keeps it: the shared form surface owns that band, and a tray holding
	 * a second one would put the two halves of one act in two places.*
	 *
	 * **What each section is drawn for is what this reader may write.** The name is
	 * `renameMember`'s, the role and the widening are `changeRole`'s and the workspaces are
	 * `grantWorkspace`'s (effort 826, requirement 15), so a reader holding one of the three meets
	 * one section rather than a surface of controls that refuse them.
	 *
	 * **The name is a section of this surface, not a surface of its own** (effort 832, requirement
	 * 6). A member's card offered *rename* and *edit* side by side, two verbs for one person's
	 * standing; there is one edit now, and it opens this. The rule is requirement 21's of effort
	 * 824, the one schema in `organization/username-form.ts` with the sentence Rust refuses with,
	 * checked when the field is left and again on the save. Whether a username is taken is Rust's
	 * alone, and that refusal marks the name the way the others mark their sections.
	 *
	 * **One save runs the acts that exist**, and each refuses as it refuses today. A refusal marks
	 * its own section ([[rules/interface]], *Validation errors*): the grants' on the workspaces,
	 * and the role act's on whichever of the two asked for the change, since one act writes both
	 * the role and the column.
	 *
	 * **Its sections are the ones the sheet that adds a member draws** (ticket 42 of effort 832):
	 * the role's tray, what they may do beyond it and the workspaces are `member-role.svelte`,
	 * `member-acts.svelte` and `member-workspaces.svelte`, with `member-section-head.svelte`
	 * heading each list, so adding a member and editing one read as one surface in two moments.
	 * What those say about the choices they hold is theirs.
	 *
	 * **The mutations are the caller's.** This owns the surface and what is chosen on it, and
	 * hands the three up through `onSave`.
	 */
	let {
		open,
		onOpenChange,
		username,
		role,
		permissions,
		rows,
		canRename,
		canChangeRole,
		canGrantWorkspace,
		canGrantSigning,
		canGrantReadOnly,
		isSaving,
		nameRefusal,
		roleRefusal,
		workspacesRefusal,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the member whose row this writes, named in the description and opening the name field. */
		username: string;
		/** the role their row carries now. The owner's row never opens this. */
		role: string;
		/** the permission value their row carries now. */
		permissions: number;
		/** every workspace a grant can be held on, with what this member holds on it today. */
		rows: AccessRow[];
		/** whether the reader's row carries `renameMember`: the name. */
		canRename: boolean;
		/** whether the reader's row carries `changeRole`: the role and the widening. */
		canChangeRole: boolean;
		/** whether the reader's row carries `grantWorkspace`: the workspaces. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner, which is who may hand out an act that signs a row. */
		canGrantSigning: boolean;
		/** whether the reader is the owner, which is who mints a read only credential. */
		canGrantReadOnly: boolean;
		isSaving: boolean;
		/** what the rename was refused with, or `null`. */
		nameRefusal: string | null;
		/** what the role act was refused with, or `null`. */
		roleRefusal: string | null;
		/** what the grants were refused with, or `null`. */
		workspacesRefusal: string | null;
		onSave: (edit: MemberEdit) => void;
	} = $props();

	let chosenName = $state('');
	/** what the name field was refused with here, before anything was written. */
	let nameInvalid = $state<string | null>(null);
	let chosenRole = $state<'administrator' | 'member'>('member');
	let chosen = $state<number>(0);
	let access = $state<Record<string, AccessChoice>>({});

	// a fresh open starts on what the row holds, with nothing left over from the last member.
	$effect(() => {
		if (open) {
			chosenName = username;
			nameInvalid = null;
			chosenRole = role === 'administrator' ? 'administrator' : 'member';
			chosen = permissions;
			access = Object.fromEntries(rows.map((row) => [row.id, row.access]));
		}
	});

	const wasAdministrator = $derived(role === 'administrator');
	const roleChanged = $derived(chosenRole !== (wasAdministrator ? 'administrator' : 'member'));

	/**
	 * whether the role act's refusal belongs to the widening rather than to the role.
	 *
	 * One act writes both, so what it was asked for is what says which section refused: a save
	 * that left the role alone and changed the acts was refused about an act.
	 */
	const refusedOnActs = $derived(roleRefusal !== null && !roleChanged && chosenRole === 'member');

	// picking a role fills the list in with what that role is created with, and leaves it
	// editable: the column is still what the member may do (826, requirement 6).
	const pickRole = (value: 'administrator' | 'member') => {
		chosenRole = value;
		chosen = ADMINISTRATION_BY_ROLE[value];
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
			role: chosenRole,
			permissions: chosen,
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

		{#if canChangeRole}
			<MemberRole
				id="member-role"
				value={chosenRole}
				onPick={pickRole}
				canMakeAdministrator={canGrantSigning}
				disabled={isSaving}
				error={roleRefusal && !refusedOnActs ? roleRefusal : null}
			/>

			{#if chosenRole === 'member'}
				<MemberActs
					id="acts"
					bind:chosen
					{canGrantSigning}
					disabled={isSaving}
					error={refusedOnActs ? roleRefusal : null}
				/>
			{/if}
		{/if}

		{#if canGrantWorkspace}
			<MemberWorkspaces
				id="workspaces"
				rowPrefix="access"
				description={$LL.organization.dashboard.accessTakenBack()}
				empty={$LL.organization.dashboard.noWorkspaces()}
				{rows}
				{access}
				onPick={pickAccess}
				{canGrantReadOnly}
				disabled={isSaving}
				error={workspacesRefusal}
			/>
		{/if}
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
