<script lang="ts">
	import type {
		OrganizationMember,
		OrganizationWorkspace,
		WorkspaceGrant
	} from '$lib/platform/tauri';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { formatRecordDate } from '$lib/design/date';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import AccessDialog, {
		type AccessChoice
	} from '$lib/organization/component/access-dialog.svelte';
	import RenameMemberDialog from '$lib/organization/component/rename-member-dialog.svelte';
	import RoleDialog from '$lib/organization/component/role-dialog.svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import HashIcon from '@lucide/svelte/icons/hash';
	import KeyIcon from '@lucide/svelte/icons/key-round';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import LockIcon from '@lucide/svelte/icons/lock';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPenIcon from '@lucide/svelte/icons/user-pen';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import type { Component } from 'svelte';

	/**
	 * Everybody in the organization, as one list.
	 *
	 * **One list, and a person who has not arrived yet is a row in it** (requirement 15 of effort
	 * 826). An invitation makes the account, so somebody invited is already a member with a
	 * username, a role and their workspaces; a second list of pending accounts said the same
	 * facts in weaker words and left the reader to match a name in one list against a name in the
	 * other. *There was one until this ticket, from a call of its own.*
	 *
	 * **The row is two lines and the actions are a cluster**, which is what the human chose on
	 * screen against the real organization when the settings area was prototyped.
	 * The identity leads: the avatar, the username, the role, and on a pending row the badge with
	 * the expiry. The workspaces follow as chips carrying their own access, with the label folded
	 * into the value (*Labels are a last resort*, Refactoring UI p.48). The actions appear on
	 * hover and on focus, so a list of twenty people is a list of people rather than a wall of
	 * controls; `focus-within` is what keeps every one of them reachable from the keyboard, and
	 * they are drawn at full opacity rather than removed, so nothing moves when they arrive. The
	 * single line with five trailing buttons that this replaced was withdrawn there.
	 *
	 * **A control for an act the session lacks is absent, not disabled.** Each gate is drawn from
	 * the reader's own permissions and refused again in Rust on the signed row; the two
	 * owner-only sentences the spec names are the exception, and they are in the dialogs that
	 * carry them rather than here.
	 *
	 * **Removal has two speeds, and the ordinary one is the control.** Removing stops renewing:
	 * the member's credential runs out within its lifetime and nobody else notices. Locking out
	 * rotates every workspace they held and stops everybody else in those workspaces until their
	 * application reconnects; it is drawn for the owner alone, as a separate, lesser control,
	 * because it is chosen rather than fallen into, and what it costs is said by the dialog that
	 * asks before it runs. That dialog reads a query, so it lives on the route and this raises it.
	 *
	 * **The three light dialogs are mounted here once** and opened on whichever row named them:
	 * the role and its acts, the workspaces and their access, and the rename. The invite dialog
	 * is not one of them: it is mounted in the shell, because the rail opens it too, and this
	 * section's button asks for it the same way the rail's row does.
	 */
	let {
		members,
		workspaces,
		canInvite,
		canRemove,
		canLockOut,
		canRename,
		canReset,
		canChangeRole,
		canGrantWorkspace,
		isOwner,
		selfId,
		reissuing,
		revoking,
		copying,
		endingSessions,
		codeFor,
		isChangingRole,
		isChangingAccess,
		onEndSessions,
		onReissue,
		onRevoke,
		onCopyLink,
		onFreshCode,
		onRemove,
		onLockOut,
		onRename,
		onChangeRole,
		onChangeAccess
	}: {
		members: OrganizationMember[];
		/** the workspaces the reader can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		/** whether the reader's row carries `inviteMember`: the invite, a copy link and a revoke. */
		canInvite: boolean;
		/** whether the reader's row carries `removeMember`. */
		canRemove: boolean;
		/** whether the reader is the owner, which is who a lock-out is for. */
		canLockOut: boolean;
		/** whether the reader's row carries `renameMember`. */
		canRename: boolean;
		/** whether the reader's row carries `resetPassword`, which is the act a new link is held to. */
		canReset: boolean;
		/** whether the reader's row carries `changeRole`. */
		canChangeRole: boolean;
		/** whether the reader's row carries `grantWorkspace`. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner: signing acts and read-only grants are theirs alone. */
		isOwner: boolean;
		/** the reader's own member id, whose row offers nothing that writes it. */
		selfId: string;
		/** the member whose link is being reissued, while it is. */
		reissuing: string | null;
		/** the invitation being revoked, while it is. */
		revoking: string | null;
		/** the invitation whose link is being read again, while it is. */
		copying: string | null;
		/** the member whose sessions are being ended, while they are. */
		endingSessions: string | null;
		/** the invitation being given a fresh code, while it is. */
		codeFor: string | null;
		isChangingRole: boolean;
		isChangingAccess: boolean;
		/**
		 * sign a member out of every machine. Their password is not changed by it, which is what
		 * makes it a different act from the new link beside it.
		 */
		onEndSessions: (memberId: string) => void;
		/** issue a member a fresh link, which is what a reset is. */
		onReissue: (memberId: string) => void;
		onRevoke: (invitationId: string) => void;
		/** hand the same link over again, for the person who issued it. */
		onCopyLink: (invitationId: string, username: string) => void;
		/**
		 * make a fresh confirmation code for a pending invitation, for the person who issued it:
		 * the link and the code together are what open the invited vault (effort 826, requirement
		 * 23), and a code lapses ninety seconds after it is made, so the row is where the issuer
		 * comes back for another.
		 */
		onFreshCode: (invitationId: string, username: string) => void;
		/** ask to remove a member: the route raises the confirm that names what it costs. */
		onRemove: (memberId: string) => void;
		onLockOut: (memberId: string) => void;
		/** rename a member; rejects with what the shared handler has already said. */
		onRename: (memberId: string, username: string) => Promise<void>;
		/** write a member's role and permissions; rejects the same way. */
		onChangeRole: (
			memberId: string,
			role: 'administrator' | 'member',
			permissions: number
		) => Promise<void>;
		/** grant and withdraw what changed on a member's workspaces; rejects the same way. */
		onChangeAccess: (
			memberId: string,
			changes: { id: string; access: AccessChoice }[]
		) => Promise<void>;
	} = $props();

	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;

	const accessLabel = (access: WorkspaceGrant['access']) =>
		access === 'read-only'
			? $LL.organization.dashboard.accessReadOnly()
			: $LL.organization.dashboard.accessFull();

	const workspaceName = (id: string) =>
		workspaces.find((workspace) => workspace.id === id)?.name ?? id;

	/**
	 * whether a row is one this reader may write at all: never their own, and never the owner's.
	 * The rename is the one exception and says so where it is drawn.
	 */
	const writable = (member: OrganizationMember) => member.id !== selfId && member.role !== 'owner';

	/** the member each dialog is open on, while it is. */
	let renaming = $state<OrganizationMember | null>(null);
	let changingRole = $state<OrganizationMember | null>(null);
	let changingAccess = $state<OrganizationMember | null>(null);
	let isRenaming = $state(false);

	const rename = async (username: string) => {
		if (!renaming) return;

		isRenaming = true;

		try {
			await onRename(renaming.id, username);
			renaming = null;
		} catch {
			// said by the shared handler. The surface stays open on what they typed, because the
			// refusals that reach here are the ones a person retries: a username somebody holds.
		} finally {
			isRenaming = false;
		}
	};

	const changeRole = async (role: 'administrator' | 'member', permissions: number) => {
		if (!changingRole) return;

		try {
			await onChangeRole(changingRole.id, role, permissions);
			changingRole = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen. The refusal that
			// reaches here is the owner's sentence on a signing act, which a person answers by
			// choosing something narrower rather than by starting again.
		}
	};

	const changeAccess = async (changes: { id: string; access: AccessChoice }[]) => {
		if (!changingAccess) return;

		try {
			await onChangeAccess(changingAccess.id, changes);
			changingAccess = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen.
		}
	};

	/** the rows the access dialog draws for a member: every workspace, with what they hold on it. */
	const accessRows = (member: OrganizationMember) =>
		workspaces.map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			access: (member.workspaces.find((held) => held.id === workspace.id)?.access ??
				'none') as AccessChoice
		}));
</script>

<!--
	one action on a row, as a glyph that says what it is on hover and to a screen reader.

	`aria-label` rather than a visible word: five to eight of these on a row is a row of labels
	otherwise, and the cluster is what the prototype settled. The tooltip carries the same words
	for a pointer.
-->
{#snippet action(
	label: string,
	Icon: Component<{ class?: string }>,
	attribute: string,
	id: string,
	onclick: () => void,
	busy: boolean = false,
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
					disabled={busy}
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

<div class="flex flex-col gap-1" data-members>
	{#each members as member (member.id)}
		<div
			class="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
			data-member={member.id}
		>
			<!-- the same disc the rail's account control and the identity block draw, with the same
			     two letters (requirement 24 of effort 824). -->
			<Avatar.Root class="size-10 shrink-0 rounded-full">
				<Avatar.Fallback class="rounded-full text-xs">
					{accountInitials(member.username)}
				</Avatar.Fallback>
			</Avatar.Root>

			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<p class="truncate text-sm font-medium" data-member-username>{member.username}</p>
					<Badge variant="secondary">{roleLabel(member.role)}</Badge>
					{#if member.pending}
						<Badge variant="outline" data-member-pending={member.pending.standing}>
							{member.pending.standing === 'lapsed'
								? $LL.organization.dashboard.standingLapsed()
								: $LL.organization.dashboard.notYetSignedIn()}
						</Badge>
						<span class="text-xs text-muted-foreground" data-member-expiry>
							{member.pending.standing === 'lapsed'
								? $LL.organization.dashboard.invitationLapsed({
										date: formatRecordDate($locale, member.pending.expiresAt)
									})
								: $LL.organization.dashboard.invitationExpires({
										date: formatRecordDate($locale, member.pending.expiresAt)
									})}
						</span>
					{/if}
				</div>

				<!-- the workspaces as chips carrying their own access: the label is folded into the
				     value, so a row says what somebody holds without a heading saying so. -->
				<div class="flex min-w-0 flex-wrap items-center gap-1">
					{#each member.workspaces as workspace (workspace.id)}
						<Badge variant="outline" class="gap-1 font-normal" data-member-workspace={workspace.id}>
							<span class="truncate">{workspaceName(workspace.id)}</span>
							<span class="text-muted-foreground">{accessLabel(workspace.access)}</span>
						</Badge>
					{/each}
					{#if member.workspaces.length === 0}
						<span class="text-xs text-muted-foreground" data-member-no-workspace={member.id}>
							{$LL.organization.dashboard.noWorkspaces()}
						</span>
					{/if}
				</div>
			</div>

			<!-- on hover and on focus, and never gone: opacity keeps the row's geometry still, and
			     `focus-within` is what puts every control in the keyboard's reach. -->
			<div
				class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
				data-member-actions={member.id}
			>
				{#if canChangeRole && writable(member)}
					{@render action(
						$LL.organization.dashboard.changeRoleTitle(),
						ShieldIcon,
						'data-member-role',
						member.id,
						() => {
							changingRole = member;
						}
					)}
				{/if}

				{#if canGrantWorkspace && writable(member)}
					{@render action(
						$LL.organization.dashboard.accessTitle(),
						KeyIcon,
						'data-member-access',
						member.id,
						() => {
							changingAccess = member;
						}
					)}
				{/if}

				<!-- the rename is the one act drawn on the owner's row: an account's name is given and
				     changed by an administrator and never by its holder, and the spec names the row
				     rather than the role. -->
				{#if canRename && member.id !== selfId}
					{@render action(
						$LL.organization.dashboard.rename(),
						UserPenIcon,
						'data-member-rename',
						member.id,
						() => {
							renaming = member;
						}
					)}
				{/if}

				{#if member.pending && canInvite && member.pending.canCopy}
					{@const pending = member.pending}
					{@render action(
						$LL.organization.dashboard.copyLink(),
						CopyIcon,
						'data-member-copy-link',
						member.id,
						() => onCopyLink(pending.invitationId, member.username),
						copying !== null
					)}
					<!-- beside the copy, and gated the same way: only the issuer's own vault holds
					     what a fresh code is sealed under, so for anybody else the row offers a new
					     link, which is a reset. -->
					{@render action(
						$LL.organization.dashboard.memberCode(),
						HashIcon,
						'data-member-code',
						member.id,
						() => onFreshCode(pending.invitationId, member.username),
						codeFor !== null
					)}
				{/if}

				{#if canReset && writable(member)}
					{@render action(
						$LL.organization.dashboard.newLink(),
						RefreshCwIcon,
						'data-member-new-link',
						member.id,
						() => onReissue(member.id),
						reissuing !== null
					)}
				{/if}

				<!-- beside the new link and behind the same act, because the two are the same
				     trust read twice: whoever may hand somebody a fresh way in may close the ways
				     in that are already open (effort 826, requirement 22). Never on the owner's
				     row and never on the reader's own, which `writable` is. -->
				{#if canReset && writable(member)}
					{@render action(
						$LL.organization.dashboard.endSessions(),
						LaptopIcon,
						'data-member-end-sessions',
						member.id,
						() => onEndSessions(member.id),
						endingSessions !== null
					)}
				{/if}

				{#if member.pending && canInvite}
					{@const pending = member.pending}
					{@render action(
						$LL.organization.dashboard.revoke(),
						BanIcon,
						'data-member-revoke',
						member.id,
						() => onRevoke(pending.invitationId),
						revoking !== null
					)}
				{/if}

				{#if canRemove && writable(member)}
					{@render action(
						$LL.organization.dashboard.remove(),
						UserMinusIcon,
						'data-member-remove',
						member.id,
						() => onRemove(member.id),
						false,
						'destructive'
					)}
				{/if}

				{#if canRemove && canLockOut && writable(member)}
					{@render action(
						$LL.organization.dashboard.removeAndLockOut(),
						LockIcon,
						'data-member-lock-out',
						member.id,
						() => onLockOut(member.id),
						false,
						'destructive'
					)}
				{/if}
			</div>
		</div>
	{/each}
</div>

{#if canInvite}
	<div>
		<!-- the verb's glyph before its label, as every primary here carries one. The dialog is the
		     shell's, opened the same way the rail's invite row opens it. -->
		<Button type="button" data-invite-open onclick={() => openOrganizationDialog('invite')}>
			<UserPlusIcon class="size-4" />
			{$LL.organization.dashboard.invite()}
		</Button>
	</div>
{/if}

<RenameMemberDialog
	open={renaming !== null}
	onOpenChange={(open) => {
		if (!open && !isRenaming) renaming = null;
	}}
	username={renaming?.username ?? ''}
	{isRenaming}
	onRename={(username) => void rename(username)}
/>

<RoleDialog
	open={changingRole !== null}
	onOpenChange={(open) => {
		if (!open && !isChangingRole) changingRole = null;
	}}
	username={changingRole?.username ?? ''}
	role={changingRole?.role ?? 'member'}
	permissions={changingRole?.permissions ?? 0}
	canGrantSigning={isOwner}
	isSaving={isChangingRole}
	onSave={(role, permissions) => void changeRole(role, permissions)}
/>

<AccessDialog
	open={changingAccess !== null}
	onOpenChange={(open) => {
		if (!open && !isChangingAccess) changingAccess = null;
	}}
	title={$LL.organization.dashboard.accessTitle()}
	description={$LL.organization.dashboard.accessDescription({
		username: changingAccess?.username ?? ''
	})}
	rows={changingAccess ? accessRows(changingAccess) : []}
	canGrantReadOnly={isOwner}
	isSaving={isChangingAccess}
	onSave={(changes) => void changeAccess(changes)}
/>
