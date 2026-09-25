<script lang="ts">
	import type { OrganizationWorkspace, WorkspaceGrant } from '$lib/platform/tauri';
	import { usernameSchema } from '$lib/organization/username-form';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice, AccessRow } from '$lib/organization/component/access-dialog.svelte';
	import MemberOverride from '$lib/organization/component/member-override.svelte';
	import MemberRole from '$lib/organization/component/member-role.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import MemberWorkspaces from '$lib/organization/component/member-workspaces.svelte';
	import type { OrganizationRole } from '$lib/platform/host';
	import { BUILT_IN } from '@rentable/workspace-permission';
	import UserIcon from '@lucide/svelte/icons/user';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { surfaceForm } from '$lib/design/form';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * Making an account: a username, a role, what is changed for the person alone, and the
	 * workspaces they hold with what each one is good for.
	 *
	 * **Laid out as the member's sheet is** (ticket 42 of effort 832). Adding a member and editing
	 * one are one surface in two moments, so this draws the sections `member-sheet.svelte` draws,
	 * in its order and from the same pieces: the username under its head, the role in its tray
	 * (`member-role.svelte`), what they may do flag by flag (`member-override.svelte`), and a row
	 * per workspace with its three levels
	 * (`member-workspaces.svelte`). *It drew an uppercase label, a bare role control the width of
	 * the panel, seven checkboxes and a checkbox per workspace until the human saw the two sheets
	 * side by side in the running build and asked for this one to read like the other.*
	 *
	 * **It hands over nothing** (effort 828, requirement 20). The account holds no password until
	 * its first link is opened, and the link is its own act on the account afterwards, so this form
	 * ends where every other create form ends: the surface closes and the directory has a row it
	 * did not have. *It showed the link in a result panel until effort 828 split the account and
	 * the link into two acts, and three places explained one link.*
	 *
	 * **On the shared form surface, heavy.** Making an account is a write, and every write here
	 * takes `FormSurface` ([[rules/interface]], *Form surface*); a member's sections are the heavy
	 * weight, declared rather than measured, and the sheet that edits one takes the same. It is
	 * mounted once, in the shell, and opened from the members section;
	 * `organization/dialogs.svelte.ts` says why once is the number.
	 *
	 * **The username is the whole of the identity, under the one rule.** No address and no display
	 * name: the member signs in with the username and nothing else names them (requirement 21 of
	 * effort 824). The rule it is refused by is `organization/username-form.ts`, the same schema
	 * the walk's `name` step and the member's sheet read, so a username refused here is refused
	 * there with the same sentence. It is the one field here a schema can refuse, so it is the one
	 * this form's `superForm` carries, and a refused submit moves focus to it.
	 *
	 * **An account is made in one role with one override** (effort 838, requirement 5), and opens
	 * on the member role with nothing changed, which is what most people are made as. Who may hand
	 * out what is decided by the shared pieces, as on the member's sheet: a role below the maker's
	 * rank, a flag the maker holds (requirement 7), and read only is the owner's to mint.
	 *
	 * **No access is what not granting a workspace is.** Every workspace the maker holds is a row
	 * starting there, and each row that left it becomes a grant at that level: what the account
	 * is made with is what the member's row will carry (requirement 8 of effort 826).
	 *
	 * **The mutation is the host's.** This component owns the `superForm` and the surface and
	 * hands what was chosen up through `onCreate`; `layout/component/organization-dialogs.svelte`
	 * runs it. That is what keeps this renderable in a test with no query client.
	 */
	let {
		open,
		onOpenChange,
		workspaces,
		roles,
		readerRank,
		readerPermissions,
		canGrantReadOnly,
		isCreating,
		onCreate
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the workspaces the maker can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		/** every role the organization has, which is what the tray chooses among. */
		roles: readonly OrganizationRole[];
		/** how high the maker's role stands: a role at or above it is not theirs to give. */
		readerRank: number;
		/** what the maker may do: a flag outside it is not theirs to switch. */
		readerPermissions: number;
		/** whether this machine holds the Turso authority, which is what mints a read-only credential. */
		canGrantReadOnly: boolean;
		isCreating: boolean;
		onCreate: (
			username: string,
			roleId: string,
			override: number,
			workspaces: WorkspaceGrant[]
		) => void;
	} = $props();

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the messages resolve against a locale.
	const AccountSchema = z.object({
		username: usernameSchema($LL)
	});

	type AccountForm = z.infer<typeof AccountSchema>;

	const blank: AccountForm = { username: '' };

	/**
	 * the level chosen per workspace, held beside the form rather than in it.
	 *
	 * A superforms field carries what a schema can refuse, and this is a choice with no refusal
	 * of its own: every level is one of three fixed values, and no access is not granting it.
	 */
	let access = $state<Record<string, AccessChoice>>({});

	/** the role and the override the account is made in. Same reasoning as `access`. */
	let chosenRole = $state<string>(BUILT_IN.member.id);
	let chosenOverride = $state(0);

	const roleMask = $derived(roles.find((role) => role.id === chosenRole)?.mask ?? 0);

	/** every workspace the maker can grant, as a row that holds nothing yet. */
	const rows: AccessRow[] = $derived(
		workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, access: 'none' }))
	);

	/** a grant for every row that left no access, at the level it was left on. */
	const grants = (): WorkspaceGrant[] =>
		rows.flatMap((row) => {
			const level = access[row.id] ?? row.access;

			return level === 'none' ? [] : [{ id: row.id, access: level }];
		});

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<AccountForm>(
		defaults(blank, zod4(AccountSchema)),
		{
			...surfaceForm,
			validators: zod4(AccountSchema),
			onUpdate: ({ form }) => {
				if (!form.valid || isCreating) return;

				onCreate(form.data.username.trim(), chosenRole, chosenOverride, grants());
			}
		}
	);

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// a fresh open is a fresh account, as every create form here starts blank.
	$effect(() => {
		if (open) {
			reset({ data: blank });
			access = {};
			chosenRole = BUILT_IN.member.id;
			chosenOverride = 0;
		}
	});

	const pickAccess = (id: string, value: AccessChoice) => {
		access[id] = value;
	};
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.dashboard.memberTitle()}
	description={$LL.organization.dashboard.memberDescription()}
>
	<div class="flex flex-col gap-6" data-account-form>
		<!-- what they are called, first: it is who the rest of the sheet is about. The refusal is the
		     shared field error, whose mark sits on the head's line ([[rules/interface]], *Validation
		     errors*). -->
		<Field.Set class="gap-3" aria-labelledby="account-name-legend" data-sheet-section="name">
			<Form.Field
				form={superform}
				name="username"
				class="group relative flex flex-col gap-3 space-y-0"
			>
				<MemberSectionHead
					id="account-name"
					legend={$LL.organization.dashboard.username()}
					description={$LL.organization.dashboard.usernameDescription()}
				/>

				<Form.Control>
					<InputGroup.Root class={insetControl} data-disabled={isCreating || undefined}>
						<InputGroup.Addon>
							<UserIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							name="username"
							autocomplete="off"
							aria-labelledby="account-name-legend"
							bind:value={$form.username}
							placeholder={$LL.organization.dashboard.username()}
							disabled={isCreating}
							aria-invalid={$errors.username ? 'true' : undefined}
							{...$constraints.username}
						/>
					</InputGroup.Root>
				</Form.Control>
				<FieldError />
			</Form.Field>
		</Field.Set>

		<MemberRole
			id="account-role"
			{roles}
			value={chosenRole}
			onPick={(next) => {
				chosenRole = next;
			}}
			{readerRank}
			disabled={isCreating}
		/>

		<MemberOverride
			id="account-override"
			{roleMask}
			bind:override={chosenOverride}
			held={readerPermissions}
			disabled={isCreating}
		/>

		<MemberWorkspaces
			id="account-workspaces"
			rowPrefix="account-access"
			description={$LL.organization.dashboard.memberWorkspacesDescription()}
			empty={$LL.organization.dashboard.noWorkspaceToGrant()}
			{rows}
			{access}
			onPick={pickAccess}
			{canGrantReadOnly}
			disabled={isCreating}
		/>
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
			<UserPlusIcon class="size-4" />
			{isCreating ? $LL.common.actions.working() : $LL.organization.dashboard.addMember()}
		</Button>
	{/snippet}
</FormSurface>
