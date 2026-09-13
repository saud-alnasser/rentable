<script lang="ts">
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/tauri';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import RenameMemberDialog from '$lib/organization/component/rename-member-dialog.svelte';
	import LockIcon from '@lucide/svelte/icons/lock';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPenIcon from '@lucide/svelte/icons/user-pen';

	/**
	 * Who is in the organization, as the replica says once every row has been verified.
	 *
	 * Names and addresses arrive opened by the vault this process holds; a role is what the
	 * member's signed row says, never what this machine remembers. The reissue control is the
	 * reset (requirement 13): a fresh vault under a fresh password, built from what the reissuer
	 * already holds, offered to whoever carries `inviteMember` and never for the owner.
	 *
	 * **Removal has two speeds, and the ordinary one is the control.** Removing stops renewing:
	 * the member's credential runs out within its lifetime and nobody else notices. Locking out
	 * rotates every workspace they held and stops everybody else in those workspaces until their
	 * application reconnects; it is drawn for the owner alone, as a separate, lesser control,
	 * because it is chosen rather than fallen into, and what it costs is said by the dialog that
	 * asks before it runs. Neither is drawn for the owner's row or the reader's own.
	 *
	 * **A rename is the row's own control, and it opens one dialog** (effort 824, requirement 23).
	 * Drawn for whoever carries the act on every row but the reader's own, since an account's
	 * name is given and changed by an administrator and never by its holder; the owner's row takes
	 * it too, because the spec names the row and not the role. The dialog is mounted here once and
	 * opened on whichever member the control named; the mutation is the host's, awaited through
	 * `onRename` so the surface closes on success and stays open on what was typed otherwise.
	 */
	let {
		members,
		workspaces,
		canInvite,
		canRemove,
		canLockOut,
		canRename,
		selfId,
		reissuing,
		onReissue,
		onRemove,
		onLockOut,
		onRename
	}: {
		members: OrganizationMember[];
		workspaces: OrganizationWorkspace[];
		canInvite: boolean;
		/** whether the reader's row carries `removeMember`. */
		canRemove: boolean;
		/** whether the reader is the owner, which is who a lock-out is for. */
		canLockOut: boolean;
		/** whether the reader's row carries `inviteMember`, which is the act a rename is held to. */
		canRename: boolean;
		/** the reader's own member id, whose row offers no removal and no rename. */
		selfId: string;
		/** the member whose invitation is being reissued, while it is. */
		reissuing: string | null;
		onReissue: (memberId: string) => void;
		onRemove: (memberId: string) => void;
		onLockOut: (memberId: string) => void;
		/** rename a member; rejects with what the shared handler has already said. */
		onRename: (memberId: string, username: string) => Promise<void>;
	} = $props();

	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;

	const workspaceNames = (ids: string[]) =>
		ids.map((id) => workspaces.find((workspace) => workspace.id === id)?.name ?? id).join(', ');

	/** the member being renamed, while the dialog is open on them. */
	let renaming = $state<OrganizationMember | null>(null);
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
</script>

<div class="space-y-4" data-members>
	{#each members as member (member.id)}
		<Field.Field orientation="responsive" data-member={member.id}>
			<Field.Content>
				<div class="flex min-w-0 items-center gap-3">
					<!-- the same disc the rail's account control and the workspace's members draw,
					     with the same two letters (requirement 24). -->
					<Avatar.Root class="size-10 shrink-0 rounded-full">
						<Avatar.Fallback class="rounded-full text-xs">
							{accountInitials(member.username)}
						</Avatar.Fallback>
					</Avatar.Root>
					<div class="grid min-w-0 gap-1">
						<div class="flex min-w-0 flex-wrap items-center gap-2">
							<p class="truncate text-sm font-medium">
								{member.username || roleLabel(member.role)}
							</p>
							<Badge variant="secondary">{roleLabel(member.role)}</Badge>
							{#if member.mustChangePassword}
								<Badge variant="outline">{$LL.organization.dashboard.notYetSignedIn()}</Badge>
							{/if}
						</div>
						{#if member.workspaceIds.length > 0}
							<p class="text-sm text-muted-foreground">{workspaceNames(member.workspaceIds)}</p>
						{/if}
					</div>
				</div>
			</Field.Content>

			{#if member.id !== selfId}
				<div class="flex shrink-0 flex-wrap gap-2">
					{#if canRename}
						<Button
							variant="outline"
							size="sm"
							data-member-rename={member.id}
							onclick={() => {
								renaming = member;
							}}
						>
							<UserPenIcon class="size-4" />
							{$LL.organization.dashboard.rename()}
						</Button>
					{/if}
					{#if member.role !== 'owner'}
						{#if canInvite}
							<Button
								variant="outline"
								size="sm"
								disabled={reissuing !== null}
								onclick={() => onReissue(member.id)}
							>
								<RefreshCwIcon class="size-4" />
								{reissuing === member.id
									? $LL.common.actions.working()
									: $LL.organization.dashboard.resetPassword()}
							</Button>
						{/if}
						{#if canRemove}
							<Button
								variant="outline"
								size="sm"
								data-member-remove={member.id}
								onclick={() => onRemove(member.id)}
							>
								<UserMinusIcon class="size-4" />
								{$LL.organization.dashboard.remove()}
							</Button>
						{/if}
						{#if canRemove && canLockOut}
							<Button
								variant="ghost"
								size="sm"
								data-member-lock-out={member.id}
								onclick={() => onLockOut(member.id)}
							>
								<LockIcon class="size-4" />
								{$LL.organization.dashboard.removeAndLockOut()}
							</Button>
						{/if}
					{/if}
				</div>
			{/if}
		</Field.Field>
	{/each}
</div>

<RenameMemberDialog
	open={renaming !== null}
	onOpenChange={(open) => {
		if (!open && !isRenaming) renaming = null;
	}}
	username={renaming?.username ?? ''}
	{isRenaming}
	onRename={(username) => void rename(username)}
/>
