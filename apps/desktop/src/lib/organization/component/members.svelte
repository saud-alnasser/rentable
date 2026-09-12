<script lang="ts">
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LockIcon from '@lucide/svelte/icons/lock';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';

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
	 */
	let {
		members,
		workspaces,
		canInvite,
		canRemove,
		canLockOut,
		selfId,
		reissuing,
		onReissue,
		onRemove,
		onLockOut
	}: {
		members: OrganizationMember[];
		workspaces: OrganizationWorkspace[];
		canInvite: boolean;
		/** whether the reader's row carries `removeMember`. */
		canRemove: boolean;
		/** whether the reader is the owner, which is who a lock-out is for. */
		canLockOut: boolean;
		/** the reader's own member id, whose row offers no removal. */
		selfId: string;
		/** the member whose invitation is being reissued, while it is. */
		reissuing: string | null;
		onReissue: (memberId: string) => void;
		onRemove: (memberId: string) => void;
		onLockOut: (memberId: string) => void;
	} = $props();

	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;

	const workspaceNames = (ids: string[]) =>
		ids.map((id) => workspaces.find((workspace) => workspace.id === id)?.name ?? id).join(', ');
</script>

<div class="space-y-4" data-members>
	{#each members as member (member.id)}
		<Field.Field orientation="responsive" data-member={member.id}>
			<Field.Content>
				<div class="grid min-w-0 gap-1">
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						<p class="truncate text-sm font-medium">
							{member.displayName || roleLabel(member.role)}
						</p>
						<Badge variant="secondary">{roleLabel(member.role)}</Badge>
						{#if member.mustChangePassword}
							<Badge variant="outline">{$LL.organization.dashboard.notYetSignedIn()}</Badge>
						{/if}
					</div>
					{#if member.email}
						<p class="truncate text-sm text-muted-foreground" dir="ltr">{member.email}</p>
					{/if}
					{#if member.workspaceIds.length > 0}
						<p class="text-sm text-muted-foreground">{workspaceNames(member.workspaceIds)}</p>
					{/if}
				</div>
			</Field.Content>

			{#if member.role !== 'owner' && member.id !== selfId}
				<div class="flex shrink-0 flex-wrap gap-2">
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
				</div>
			{/if}
		</Field.Field>
	{/each}
</div>
