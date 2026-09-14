<script lang="ts">
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import AccessDialog, {
		type AccessChoice
	} from '$lib/organization/component/access-dialog.svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import WorkspaceRenameForm from '$lib/workspace/component/rename-form.svelte';
	import WorkspaceTransfer from '$lib/workspace/component/transfer.svelte';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UsersIcon from '@lucide/svelte/icons/users';
	import type { Component } from 'svelte';

	/**
	 * The workspaces this member holds, as one list, and the file that moves the open one.
	 *
	 * **A row is the name, how many people are in it, and whether it is the one open here**
	 * (requirement 16 of effort 826). It takes the members row's two-line shape, which is what the
	 * human chose on screen against the real organization
	 * ([[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/prototypes/the-settings-area-on-screen]]):
	 * the name and the open mark lead, the access this reader holds and the member count follow as
	 * the second line, and the actions are an icon cluster that appears on hover and on focus.
	 * *The row said the database's hostname until this ticket, which is a fact about Turso rather
	 * than about a workspace, and said nothing about who was in it.*
	 *
	 * **Every gate is a prop, and none of them is a permission read here.** Creating and deleting
	 * a workspace are the owner's in Rust (`require_owner`), so they are drawn from who is reading
	 * and what this machine holds rather than from a bit on the row; renaming and granting are
	 * acts, read by the area from the session and handed down. `workspace/component/permitted.svelte`
	 * is deliberately not used: it subscribes to the open workspace's own permissions, which is a
	 * different question from what this member may do in the organization.
	 *
	 * **The rename is the open workspace's alone.** `remoteSync.rename` calls this machine's
	 * workspace something else, and there is no command that renames one from a distance, so a
	 * control on another row would rename the wrong thing. Whoever holds `renameWorkspace` renames
	 * the workspace they are in, from the row that says it is open.
	 *
	 * **The members action is the access dialog read the other way round**: the rows are the
	 * people rather than the workspaces, and what comes back is a member id per row. The owner is
	 * not among them, because the organization is theirs and Rust refuses a withdrawal of their
	 * own grant, and neither is the reader, for the reason no row in the members list writes its
	 * own.
	 *
	 * **The transfer sits beneath the list, under a legend naming the workspace it acts on.** It
	 * reads and writes whatever is open on this machine, which is one of the rows above, and the
	 * legend is what stops that being a guess.
	 */
	let {
		workspaces,
		members,
		openWorkspaceId,
		canCreate,
		canDelete,
		canRename,
		canGrantWorkspace,
		isOwner,
		selfId,
		isChangingAccess,
		refusal,
		onChangeAccess,
		onDelete
	}: {
		/** the workspaces this member holds a grant on, which is what the session carries. */
		workspaces: OrganizationWorkspace[];
		/** everybody in the organization, for the count on a row and the rows in the dialog. */
		members: OrganizationMember[];
		/** the workspace open on this machine, by the id the organization knows it under. */
		openWorkspaceId: string | null;
		/** whether this person, on this machine, may create: the owner holding the authority. */
		canCreate: boolean;
		/** whether this person may delete a workspace: the owner, refused again in Rust. */
		canDelete: boolean;
		/** whether the reader's row carries `renameWorkspace`. */
		canRename: boolean;
		/** whether the reader's row carries `grantWorkspace`. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner: a read-only credential is minted on their machine. */
		isOwner: boolean;
		/** the reader's own member id, which is not a row in the access dialog. */
		selfId: string;
		isChangingAccess: boolean;
		/**
		 * why there is no create control, for an owner whose machine lost the Turso authority;
		 * `null` for the owner who holds it and for everybody else, who is offered nothing and
		 * told nothing, since creating was never theirs to be refused.
		 */
		refusal: string | null;
		/** grant and withdraw what changed on a workspace's members; rejects the same way. */
		onChangeAccess: (
			workspaceId: string,
			changes: { memberId: string; access: AccessChoice }[]
		) => Promise<void>;
		/** delete a workspace and its database; rejects so the confirm stays open on the refusal. */
		onDelete: (workspaceId: string) => Promise<void>;
	} = $props();

	const accessLabel = (level: string) =>
		({
			'full-access': $LL.organization.dashboard.accessFull(),
			'read-only': $LL.organization.dashboard.accessReadOnly()
		})[level] ?? level;

	/** how many people hold a grant on a workspace, counted off the organization's own list. */
	const memberCount = (workspaceId: string) =>
		members.filter((member) => member.workspaces.some((held) => held.id === workspaceId)).length;

	/** the workspace each surface is open on, while it is. */
	let renaming = $state<OrganizationWorkspace | null>(null);
	let changingAccess = $state<OrganizationWorkspace | null>(null);
	let deleting = $state<OrganizationWorkspace | null>(null);

	const open = $derived(workspaces.find((workspace) => workspace.id === openWorkspaceId) ?? null);

	/** the rows the access dialog draws for a workspace: everybody who could hold it. */
	const accessRows = (workspace: OrganizationWorkspace) =>
		members
			.filter((member) => member.role !== 'owner' && member.id !== selfId)
			.map((member) => ({
				id: member.id,
				name: member.username,
				access: (member.workspaces.find((held) => held.id === workspace.id)?.access ??
					'none') as AccessChoice
			}));

	const changeAccess = async (changes: { id: string; access: AccessChoice }[]) => {
		if (!changingAccess) return;

		try {
			await onChangeAccess(
				changingAccess.id,
				changes.map((change) => ({ memberId: change.id, access: change.access }))
			);
			changingAccess = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen.
		}
	};
</script>

<!--
	one action on a row, as a glyph that says what it is on hover and to a screen reader. The
	members list draws its cluster the same way and for the same reason: three labels on a row is
	a row of labels.
-->
{#snippet action(
	label: string,
	Icon: Component<{ class?: string }>,
	attribute: string,
	id: string,
	onclick: () => void,
	tone: 'plain' | 'destructive' = 'plain'
)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					class={tone === 'destructive' ? 'text-destructive hover:text-destructive' : undefined}
					aria-label={label}
					{...{ [attribute]: id }}
					{onclick}
				>
					<Icon class="size-4" />
					<span class="sr-only">{label}</span>
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{label}</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Field.Set>
	<Field.Legend>{$LL.organization.dashboard.workspaces()}</Field.Legend>

	<div class="flex flex-col gap-1" data-workspaces>
		{#if workspaces.length === 0}
			<p class="text-sm text-muted-foreground">{$LL.organization.dashboard.noWorkspaces()}</p>
		{/if}

		{#each workspaces as workspace (workspace.id)}
			<div
				class="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
				data-workspace={workspace.id}
			>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						<p class="truncate text-sm font-medium" data-workspace-name>{workspace.name}</p>
						<!-- the one open here, in the rail's own word for it, so a reader meets the same
						     word in the switcher and in this list. -->
						{#if workspace.id === openWorkspaceId}
							<Badge variant="secondary" data-workspace-open={workspace.id}>
								{$LL.layout.workspaceMenu.open()}
							</Badge>
						{/if}
					</div>

					<!-- what this reader holds, and how many people are in it: the label folded into the
					     value, as the members row folds an access into its chip. -->
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						<Badge variant="outline" class="font-normal" data-workspace-access={workspace.id}>
							{accessLabel(workspace.accessLevel)}
						</Badge>
						<span class="text-xs text-muted-foreground" data-workspace-members={workspace.id}>
							{$LL.layout.workspaceMenu.members({ count: memberCount(workspace.id) })}
						</span>
					</div>
				</div>

				<!-- on hover and on focus, and never gone: opacity keeps the row's geometry still, and
				     `focus-within` is what puts every control in the keyboard's reach. -->
				<div
					class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
					data-workspace-actions={workspace.id}
				>
					{#if canRename && workspace.id === openWorkspaceId}
						{@render action(
							$LL.workspace.rename(),
							PencilIcon,
							'data-workspace-rename',
							workspace.id,
							() => {
								renaming = workspace;
							}
						)}
					{/if}

					{#if canGrantWorkspace}
						{@render action(
							$LL.organization.dashboard.workspaceAccessTitle(),
							UsersIcon,
							'data-workspace-grant',
							workspace.id,
							() => {
								changingAccess = workspace;
							}
						)}
					{/if}

					{#if canDelete}
						{@render action(
							$LL.organization.dashboard.deleteWorkspace(),
							Trash2Icon,
							'data-workspace-delete',
							workspace.id,
							() => {
								deleting = workspace;
							},
							'destructive'
						)}
					{/if}
				</div>
			</div>
		{/each}

		{#if canCreate}
			<div class="pt-2">
				<!-- the verb's glyph before its label, as every primary here carries one. The form that
				     names a new workspace is the shared one mounted in the shell, and this is the
				     control that opens it. -->
				<Button
					type="button"
					data-workspace-create
					onclick={() => openOrganizationDialog('workspace')}
				>
					<PlusIcon class="size-4" />
					{$LL.layout.workspaceMenu.create()}
				</Button>
			</div>
		{:else if refusal}
			<p class="text-sm text-muted-foreground" data-workspace-refusal>{refusal}</p>
		{/if}
	</div>
</Field.Set>

<!-- beneath the list, and named for the workspace it acts on: a file is written from what is open
     on this machine, which is one of the rows above. Drawn only where there is one, since there is
     nothing to write out of a machine that has opened none. -->
{#if open}
	<Separator />

	<Field.Set>
		<Field.Legend>
			{$LL.organization.dashboard.transferTitle({ workspace: open.name })}
		</Field.Legend>
		<WorkspaceTransfer />
	</Field.Set>
{/if}

{#if open}
	<WorkspaceRenameForm
		workspace={open}
		open={renaming !== null}
		onOpenChange={(value) => {
			if (!value) renaming = null;
		}}
	/>
{/if}

<AccessDialog
	open={changingAccess !== null}
	onOpenChange={(value) => {
		if (!value && !isChangingAccess) changingAccess = null;
	}}
	title={$LL.organization.dashboard.workspaceAccessTitle()}
	description={$LL.organization.dashboard.workspaceAccessDescription({
		workspace: changingAccess?.name ?? ''
	})}
	rows={changingAccess ? accessRows(changingAccess) : []}
	canGrantReadOnly={isOwner}
	isSaving={isChangingAccess}
	onSave={(changes) => void changeAccess(changes)}
/>

<!-- the packaged confirm, which names what is lost before it offers anything destructive
     ([[rules/interface]], *Form surface*). Deleting a workspace deletes its database on Turso,
     and nothing anywhere puts it back. -->
<DeleteDialog
	open={deleting !== null}
	onOpenChange={(value) => {
		if (!value) deleting = null;
	}}
	onSubmit={async () => {
		if (deleting) await onDelete(deleting.id);
	}}
	record={deleting?.name ?? ''}
	title={$LL.organization.dashboard.deleteWorkspace()}
	description={$LL.organization.dashboard.deleteWorkspaceDescription()}
	confirmLabel={$LL.organization.dashboard.deleteWorkspace()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
