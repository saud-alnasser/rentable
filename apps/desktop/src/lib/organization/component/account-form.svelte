<script lang="ts">
	import type { OrganizationWorkspace, WorkspaceGrant } from '$lib/platform/tauri';
	import { usernameSchema } from '$lib/organization/username-form';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		ADMINISTRATION_BY_ROLE,
		EVERY_ADMINISTRATION,
		maskOf,
		permits,
		type Administration
	} from '@rentable/workspace-permission';
	import UserIcon from '@lucide/svelte/icons/user';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * Making an account: a username, a role, what the person may do, and the workspaces they hold
	 * with what each one is good for.
	 *
	 * **It hands over nothing** (effort 828, requirement 20). The account holds no password until
	 * its first link is opened, and the link is its own act on the account afterwards, so this form
	 * ends where every other create form ends: the surface closes and the directory has a row it
	 * did not have. *It showed the link in a result panel until effort 828 split the account and
	 * the link into two acts, and three places explained one link.*
	 *
	 * **On the shared form surface, heavy.** Making an account is a write, and every write here
	 * takes `FormSurface` ([[rules/interface]], *Form surface*); four fieldsets are the heavy
	 * weight, declared rather than measured, so this is the edge sheet and it fills the width below
	 * the breakpoint without swapping components under a half-typed form. It is mounted once, in
	 * the shell, and opened from the members section; `organization/dialogs.svelte.ts` says why
	 * once is the number.
	 *
	 * **The username is the whole of the identity, under the one rule.** No address and no display
	 * name: the member signs in with the username and nothing else names them (requirement 21 of
	 * effort 824). The rule it is refused by is `organization/username-form.ts`, the same schema
	 * the walk's `name` step and the rename dialog read, so a username refused here is refused
	 * there with the same sentence.
	 *
	 * **The role sets the acts; the acts are the truth** (requirement 6 of effort 826). A role is a
	 * bundle an account is created with and the one word the directory calls it, so picking one
	 * fills the checkboxes in and leaves them editable, exactly as `role-dialog.svelte` does on an
	 * account that exists. Handing out an act that signs a row is the owner's, because certifying a
	 * signer needs the organization key their vault alone yields, so for anybody else those acts
	 * are drawn refused rather than hidden: a control that vanishes says the act does not exist.
	 *
	 * **A workspace is a checkbox and an access**, which is requirement 8 of effort 826: what the
	 * account is made with is what the member's row will carry, and a grant that could only ever be
	 * full access made the read-only half of the model unreachable from the one surface that
	 * creates grants. Read only is minted on the owner's machine and refused by name elsewhere, so
	 * for anybody else the choice is drawn refused rather than hidden, for the same reason.
	 *
	 * **The fields lead with their subject's glyph, muted.** An icon covers more surface than the
	 * text beside it and reads as emphasised at the same colour, so the addon lowers its contrast
	 * (*Balance weight and contrast*, Refactoring UI p.56). A validation error still marks the
	 * field the way the rule says: the group's border from `aria-invalid`, and `FieldError` on
	 * the label line.
	 *
	 * **The mutation is the host's.** This component owns the `superForm` and the surface and
	 * hands what was typed up through `onCreate`; `layout/component/organization-dialogs.svelte`
	 * runs it. That is what keeps this renderable in a test with no query client.
	 */
	let {
		open,
		onOpenChange,
		workspaces,
		canInviteAdministrators,
		canGrantReadOnly,
		isCreating,
		onCreate
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the workspaces the maker can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		/** whether the reader is the owner, which is who may hand out an act that signs a row. */
		canInviteAdministrators: boolean;
		/** whether this machine holds the Turso authority, which is what mints a read-only credential. */
		canGrantReadOnly: boolean;
		isCreating: boolean;
		onCreate: (
			username: string,
			role: 'administrator' | 'member',
			permissions: number,
			workspaces: WorkspaceGrant[]
		) => void;
	} = $props();

	/**
	 * the one act of the seven that signs nothing: `renameWorkspace` writes the sealed workspace
	 * name outside the signature, so an account holding it needs no certificate and anybody who
	 * makes accounts can hand it out.
	 */
	const SIGNS_NOTHING: Administration = 'renameWorkspace';

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the messages resolve against a locale.
	const AccountSchema = z.object({
		username: usernameSchema($LL),
		role: z.enum(['administrator', 'member']),
		workspaceIds: z.array(z.string())
	});

	type AccountForm = z.infer<typeof AccountSchema>;

	const blank: AccountForm = { username: '', role: 'member', workspaceIds: [] };

	/**
	 * the access chosen per workspace, held beside the form rather than in it.
	 *
	 * A superforms field carries what a schema can refuse, and this is a choice with no refusal
	 * of its own: an unchecked workspace is not granted at all, so its access says nothing, and a
	 * checked one is always one of two values. The checkbox is the field; this is what it is
	 * worth.
	 */
	let access = $state<Record<string, WorkspaceGrant['access']>>({});

	/** the acts the new account is to carry. Same reasoning as `access`: no refusal of its own. */
	let chosen = $state<number>(ADMINISTRATION_BY_ROLE.member);

	/** the acts this reader may not hand out: every signing one, since a new account holds none. */
	const refused: Administration[] = $derived(
		canInviteAdministrators
			? []
			: EVERY_ADMINISTRATION.filter((act): act is Administration => act !== SIGNS_NOTHING)
	);

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<AccountForm>(
		defaults(blank, zod4(AccountSchema)),
		{
			SPA: true,
			validators: zod4(AccountSchema),
			onUpdate: ({ form }) => {
				if (!form.valid || isCreating) return;

				onCreate(
					form.data.username.trim(),
					form.data.role,
					chosen,
					form.data.workspaceIds.map((id) => ({ id, access: access[id] ?? 'full-access' }))
				);
			}
		}
	);

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// a fresh open is a fresh account, as every create form here starts blank.
	$effect(() => {
		if (open) {
			reset({ data: blank });
			access = {};
			chosen = ADMINISTRATION_BY_ROLE.member;
		}
	});

	const roleLabel = (value: string) =>
		({
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

	const accessLabel = (value: WorkspaceGrant['access']) =>
		value === 'read-only'
			? $LL.organization.dashboard.accessReadOnly()
			: $LL.organization.dashboard.accessFull();

	const toggleAct = (act: Administration, checked: boolean) => {
		chosen = checked ? chosen + maskOf(act) : chosen - maskOf(act);
	};

	// picking a role fills the boxes in with what that role is created with, and leaves them
	// editable: the column is still what the person may do.
	const pickRole = (value: string) => {
		if (value !== 'administrator' && value !== 'member') return;

		$form.role = value;
		chosen = ADMINISTRATION_BY_ROLE[value];
	};

	const toggleWorkspace = (id: string, checked: boolean) => {
		$form.workspaceIds = checked
			? [...new Set([...$form.workspaceIds, id])]
			: $form.workspaceIds.filter((held) => held !== id);

		if (checked && !access[id]) access[id] = 'full-access';
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
	<div class="flex flex-col gap-4" data-account-form>
		<Form.Field form={superform} name="username" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.organization.dashboard.username()}</Form.Label>
				<InputGroup.Root class={insetControl} data-disabled={isCreating || undefined}>
					<InputGroup.Addon>
						<UserIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						name="username"
						autocomplete="off"
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

		<Field.Field>
			<Field.Label for="account-role">{$LL.organization.dashboard.role()}</Field.Label>
			<Select.Root type="single" value={$form.role} onValueChange={pickRole} disabled={isCreating}>
				<Select.Trigger id="account-role" class={cn('w-full capitalize', insetControl)}>
					{roleLabel($form.role)}
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
						disabled={!canInviteAdministrators}
					>
						{roleLabel('administrator')}
					</Select.Item>
				</Select.Content>
			</Select.Root>
			{#if !canInviteAdministrators}
				<Field.Description
					>{$LL.organization.dashboard.administratorsAreTheOwners()}</Field.Description
				>
			{/if}
		</Field.Field>

		<Field.Set>
			<Field.Legend>{$LL.organization.dashboard.permissionsLegend()}</Field.Legend>
			{#each EVERY_ADMINISTRATION as act (act)}
				<Field.Field orientation="horizontal" data-act={act}>
					<Checkbox
						id={`account-act-${act}`}
						checked={permits(chosen, act)}
						onCheckedChange={(checked) => toggleAct(act, checked === true)}
						disabled={isCreating || refused.includes(act)}
					/>
					<Field.Label for={`account-act-${act}`}>{actLabel(act)}</Field.Label>
				</Field.Field>
			{/each}
			{#if refused.length > 0}
				<Field.Description data-account-refusal>
					{$LL.organization.dashboard.signingIsTheOwners()}
				</Field.Description>
			{/if}
		</Field.Set>

		<Field.Set>
			<Field.Legend>{$LL.settings.section.workspaces()}</Field.Legend>
			{#if workspaces.length === 0}
				<Field.Description>{$LL.organization.dashboard.noWorkspaceToGrant()}</Field.Description>
			{/if}
			{#each workspaces as workspace (workspace.id)}
				{@const held = $form.workspaceIds.includes(workspace.id)}
				<Field.Field orientation="horizontal" data-invite-workspace={workspace.id}>
					<Checkbox
						id={`invite-workspace-${workspace.id}`}
						name="workspaceIds"
						checked={held}
						onCheckedChange={(checked) => toggleWorkspace(workspace.id, checked === true)}
						disabled={isCreating}
					/>
					<Field.Label for={`invite-workspace-${workspace.id}`} class="flex-1">
						{workspace.name}
					</Field.Label>
					<!-- the access is the grant's own value and reads beside it; a workspace nobody
					     granted has none to choose, so the control waits for the checkbox. -->
					<Select.Root
						type="single"
						value={access[workspace.id] ?? 'full-access'}
						onValueChange={(value) => {
							if (value === 'full-access' || value === 'read-only') {
								access[workspace.id] = value;
							}
						}}
						disabled={isCreating || !held}
					>
						<Select.Trigger
							class={cn('w-40 shrink-0', insetControl)}
							data-invite-access={workspace.id}
						>
							{accessLabel(access[workspace.id] ?? 'full-access')}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="full-access" label={accessLabel('full-access')}>
								{accessLabel('full-access')}
							</Select.Item>
							<!-- drawn refused rather than absent: the access exists, and who mints it is
							     the fact worth saying (requirement 5). -->
							<Select.Item
								value="read-only"
								label={accessLabel('read-only')}
								disabled={!canGrantReadOnly}
							>
								{accessLabel('read-only')}
							</Select.Item>
						</Select.Content>
					</Select.Root>
				</Field.Field>
			{/each}
			{#if !canGrantReadOnly && workspaces.length > 0}
				<Field.Description>{$LL.organization.dashboard.readOnlyIsTheOwners()}</Field.Description>
			{/if}
		</Field.Set>
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
