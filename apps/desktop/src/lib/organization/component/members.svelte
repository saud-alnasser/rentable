<script lang="ts">
	import type {
		OrganizationMember,
		OrganizationWorkspace,
		WorkspaceGrant
	} from '$lib/platform/tauri';
	import type { RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import RowActions from '@rentable/design/block/row-actions.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
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
	import KeyIcon from '@lucide/svelte/icons/key-round';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import LockIcon from '@lucide/svelte/icons/lock';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPenIcon from '@lucide/svelte/icons/user-pen';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * Everybody in the organization, as one list.
	 *
	 * **One list, and a person who has not arrived yet is a row in it** (requirement 15 of effort
	 * 826). An invitation makes the account, so somebody invited is already a member with a
	 * username, a role and their workspaces; a second list of pending accounts said the same
	 * facts in weaker words and left the reader to match a name in one list against a name in the
	 * other. *There was one until this ticket, from a call of its own.*
	 *
	 * **The section says what it is for before it lists anybody** (requirement 6 of effort 828).
	 * The legend and one sentence lead, the invite stands beside them as the section's one primary
	 * (*Semantics are secondary*, Refactoring UI p.60), and the list follows. The sentence sits
	 * against the legend and the list sits well clear of both, so the head reads as one thing
	 * rather than as the first row of another (*Avoid ambiguous spacing*, p.96). The invite used
	 * to trail the list, where a reader met it after scrolling past everybody already invited.
	 *
	 * **The row is two lines and every act is behind one visible control.** The identity leads:
	 * the avatar, the username, the role, and on a pending row the badge with the expiry. The
	 * workspaces follow as chips carrying their own access, with the label folded into the value
	 * (*Labels are a last resort*, p.48). The row ends in the shared `row-actions` control, whose
	 * menu holds the acts in four groups: what the person is called, what they may do, their way
	 * in, and leaving. *Up to eight glyphs appeared here on hover until this ticket, which
	 * promised nothing to a reader who never swept the row and made eight decisions out of one.*
	 *
	 * **An act the session lacks is absent from the menu, not disabled.** Each gate is drawn from
	 * the reader's own permissions and refused again in Rust on the signed row; the two
	 * owner-only sentences the spec names are the exception, and they are in the dialogs that
	 * carry them rather than here.
	 *
	 * **Removal has two speeds, and the ordinary one is the control.** Removing stops renewing:
	 * the member's credential runs out within its lifetime and nobody else notices. Locking out
	 * rotates every workspace they held and stops everybody else in those workspaces until their
	 * application reconnects; it is drawn for the owner alone, in the last group and under the
	 * remove, because it is chosen rather than fallen into, and what it costs is said by the
	 * dialog that asks before it runs. That dialog reads a query, so it lives on the route and
	 * this raises it.
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
		isChangingRole,
		isChangingAccess,
		onEndSessions,
		onReissue,
		onRevoke,
		onCopyLink,
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
		/**
		 * hand the same link and the same code over again, for the person who issued it. Both,
		 * because a code lives as long as its link (effort 828, requirement 1), so there is one
		 * pair per invitation and copying it is showing that pair again.
		 */
		onCopyLink: (invitationId: string, username: string, expiresAt: number) => void;
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

	/**
	 * what this reader may do to one person, in the four groups the menu separates.
	 *
	 * The order is requirement 6's and is read here as a list: what they are called, what they may
	 * do, their way in, and leaving. Every gate is the one the cluster carried before it, and an
	 * act the reader does not hold leaves no entry, so a group can empty and the block draws
	 * neither its items nor a separator.
	 *
	 * `attributes` is what the section is read by, here and in its test: the act and the row it
	 * acts on, which is what the cluster's controls carried and what the menu items carry now.
	 */
	const actsOn = (member: OrganizationMember): RecordCardAction[][] => {
		const invitation = member.pending;

		return [
			// the rename is the one act drawn on the owner's row: an account's name is given and
			// changed by an administrator and never by its holder, and the spec names the row
			// rather than the role.
			canRename && member.id !== selfId
				? [
						{
							label: $LL.organization.dashboard.rename(),
							icon: UserPenIcon,
							attributes: { 'data-member-rename': member.id },
							onSelect: () => {
								renaming = member;
							}
						}
					]
				: [],

			[
				...(canChangeRole && writable(member)
					? [
							{
								label: $LL.organization.dashboard.changeRoleTitle(),
								icon: ShieldIcon,
								attributes: { 'data-member-role': member.id },
								onSelect: () => {
									changingRole = member;
								}
							}
						]
					: []),
				...(canGrantWorkspace && writable(member)
					? [
							{
								label: $LL.organization.dashboard.accessTitle(),
								icon: KeyIcon,
								attributes: { 'data-member-access': member.id },
								onSelect: () => {
									changingAccess = member;
								}
							}
						]
					: [])
			],

			[
				// the link and its code, shown again: only the issuer's own vault opens what the
				// row sealed them under, so for anybody else the row offers a new link, which is
				// a reset.
				...(invitation && canInvite && invitation.canCopy
					? [
							{
								label: $LL.organization.dashboard.copyLink(),
								icon: CopyIcon,
								attributes: { 'data-member-copy-link': member.id },
								disabled: copying !== null,
								onSelect: () =>
									onCopyLink(invitation.invitationId, member.username, invitation.expiresAt)
							}
						]
					: []),
				...(canReset && writable(member)
					? [
							{
								label: $LL.organization.dashboard.newLink(),
								icon: RefreshCwIcon,
								attributes: { 'data-member-new-link': member.id },
								disabled: reissuing !== null,
								onSelect: () => onReissue(member.id)
							},
							// beside the new link and behind the same act, because the two are the
							// same trust read twice: whoever may hand somebody a fresh way in may
							// close the ways in that are already open (effort 826, requirement 22).
							{
								label: $LL.organization.dashboard.endSessions(),
								icon: LaptopIcon,
								attributes: { 'data-member-end-sessions': member.id },
								disabled: endingSessions !== null,
								onSelect: () => onEndSessions(member.id)
							}
						]
					: []),
				...(invitation && canInvite
					? [
							{
								label: $LL.organization.dashboard.revoke(),
								icon: BanIcon,
								attributes: { 'data-member-revoke': member.id },
								disabled: revoking !== null,
								onSelect: () => onRevoke(invitation.invitationId)
							}
						]
					: [])
			],

			[
				...(canRemove && writable(member)
					? [
							{
								label: $LL.organization.dashboard.remove(),
								icon: UserMinusIcon,
								variant: 'destructive' as const,
								attributes: { 'data-member-remove': member.id },
								onSelect: () => onRemove(member.id)
							}
						]
					: []),
				...(canRemove && canLockOut && writable(member)
					? [
							{
								label: $LL.organization.dashboard.removeAndLockOut(),
								icon: LockIcon,
								variant: 'destructive' as const,
								attributes: { 'data-member-lock-out': member.id },
								onSelect: () => onLockOut(member.id)
							}
						]
					: [])
			]
		];
	};
</script>

<Field.Set aria-labelledby="members-legend">
	<!--
		the head: what this section is, and its one primary beside it. The legend names the
		fieldset from here rather than as its caption, because a rendered legend is taken out of
		its fieldset's own layout and cannot stand on a line with anything.
	-->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<Field.Legend id="members-legend">{$LL.settings.section.members()}</Field.Legend>
			<Field.Description data-members-description>
				{$LL.organization.dashboard.membersDescription()}
			</Field.Description>
		</div>

		{#if canInvite}
			<!-- the verb's glyph before its label, as every primary here carries one. The dialog is
			     the shell's, opened the same way the rail's invite row opens it. -->
			<Button type="button" data-invite-open onclick={() => openOrganizationDialog('invite')}>
				<UserPlusIcon class="size-4" />
				{$LL.organization.dashboard.invite()}
			</Button>
		{/if}
	</div>

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
							<Badge
								variant="outline"
								class="gap-1 font-normal"
								data-member-workspace={workspace.id}
							>
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

				<!--
					one control, visible without a hover, opening the row's acts in four groups. A row that
					offers this reader nothing draws none at all, which is what the block does with four
					empty groups.
				-->
				<div class="shrink-0 pt-1">
					<RowActions
						label={$LL.organization.dashboard.memberActions({ username: member.username })}
						groups={actsOn(member)}
					/>
				</div>
			</div>
		{/each}
	</div>
</Field.Set>

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
