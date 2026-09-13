<script lang="ts">
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationInvitations from '$lib/organization/component/invitations.svelte';
	import OrganizationMembers from '$lib/organization/component/members.svelte';
	import OrganizationLink from '$lib/organization/component/organization-link.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/component/reconnect-authority.svelte';
	import OrganizationWorkspaces from '$lib/organization/component/workspaces.svelte';
	import { openOrganizationDialog, showInvited } from '$lib/organization/dialogs.svelte';
	import {
		useFetchInvitations,
		useFetchMembers,
		useFetchOrganizationState,
		useLockOutCost,
		useReissueInvitation,
		useRemoveMember,
		useRenameMember,
		useRevokeInvitation
	} from '$lib/organization/query';
	import { toast } from 'svelte-sonner';
	import { permits } from '@rentable/workspace-permission';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * The administration dashboard: who is in, who is invited, and the workspaces.
	 *
	 * **What a person may do here is what their verified row carries**, read off the session the
	 * shell holds, and every control is refused again in Rust on the same row. Inviting is drawn
	 * for whoever carries `inviteMember`, and so is renaming a member from their row, since a
	 * rename changes the one thing an invitation named; creating a workspace is drawn for the owner and explained
	 * to everybody else, because it needs the Turso authority only the owner's machine holds and
	 * the spec puts no request queue behind it.
	 *
	 * **Lists and openers, and no form.** The invite and the new workspace are each one form on the
	 * shared form surface, mounted once in the shell and opened from here and from the rail's
	 * workspace menu alike (`organization/dialogs.svelte.ts`); what this page holds is the control
	 * that opens each, so a form a person may never use no longer sits in the middle of what they
	 * came to read. A reset made from the members list shows its link and password in the same
	 * panel an invitation does.
	 *
	 * **No loading branch and no empty branch, for the reason the workspace page gives**: a page
	 * inside the shell is drawn past admission, so the session is there before this is.
	 */
	const stateQuery = useFetchOrganizationState();
	const membersQuery = useFetchMembers();
	const invitationsQuery = useFetchInvitations();
	const reissueInvitation = useReissueInvitation();
	const revokeInvitation = useRevokeInvitation();
	const removeMember = useRemoveMember();
	const renameMember = useRenameMember();

	const session = $derived(stateQuery.data?.session ?? null);
	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && stateQuery.data?.holdsTursoAuthority === false);
	const canCreateWorkspace = $derived(isOwner && stateQuery.data?.holdsTursoAuthority === true);
	const canInvite = $derived(permits(session?.permissions ?? 0, 'inviteMember'));
	const canRemove = $derived(permits(session?.permissions ?? 0, 'removeMember'));

	/**
	 * the removal being asked about: which member, and at which speed. The lock-out's dialog
	 * waits for the cost to be read, because the number it states is the number the act uses.
	 */
	let removing = $state<{ memberId: string; lockOut: boolean } | null>(null);

	const lockOutCost = useLockOutCost(() => (removing?.lockOut ? removing.memberId : null));

	const removingName = $derived.by(() => {
		if (!removing) return '';

		const member = (membersQuery.data ?? []).find(
			(candidate) => candidate.id === removing?.memberId
		);

		return member ? member.username : removing.memberId;
	});

	const lockOutDescription = $derived.by(() => {
		const cost = lockOutCost.data;

		if (!removing?.lockOut || !cost) return $LL.organization.dashboard.lockOutReading();

		return $LL.organization.dashboard.lockOutDescription({
			count: cost.membersAffected,
			workspaces:
				cost.workspaces.map((workspace) => workspace.name).join(', ') ||
				$LL.organization.dashboard.noWorkspaces()
		});
	});

	const confirmRemoval = async () => {
		if (!removing) return;

		const { memberId, lockOut } = removing;
		const removed = await removeMember.mutateAsync({ memberId, lockOut });

		toast.success(
			removed.lockedOut
				? $LL.organization.dashboard.lockedOut({ count: removed.othersMustReconnect })
				: $LL.organization.dashboard.removed()
		);
		await stateQuery.refetch();
	};

	let reissuing = $state<string | null>(null);
	let revoking = $state<string | null>(null);

	const reissue = async (memberId: string) => {
		reissuing = memberId;

		try {
			showInvited(await reissueInvitation.mutateAsync({ memberId }));
		} catch {
			// said by the shared handler.
		} finally {
			reissuing = null;
		}
	};

	const revoke = async (invitationId: string) => {
		revoking = invitationId;

		try {
			await revokeInvitation.mutateAsync({ invitationId });
		} catch {
			// said by the shared handler.
		} finally {
			revoking = null;
		}
	};
</script>

{#if session}
	<PageFrame>
		<h1 class="text-3xl font-semibold tracking-tight capitalize">
			{session.organizationName || $LL.common.nav.organization()}
		</h1>

		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.organization.dashboard.members()}</Field.Legend>
				<OrganizationMembers
					members={membersQuery.data ?? []}
					workspaces={session.workspaces}
					{canInvite}
					{canRemove}
					canLockOut={isOwner}
					canRename={canInvite}
					selfId={session.memberId}
					{reissuing}
					onReissue={(memberId) => void reissue(memberId)}
					onRemove={(memberId) => {
						removing = { memberId, lockOut: false };
					}}
					onRename={async (memberId, username) => {
						await renameMember.mutateAsync({ memberId, username });
					}}
					onLockOut={(memberId) => {
						removing = { memberId, lockOut: true };
					}}
				/>
			</Field.Set>

			{#if canInvite}
				<Separator />

				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.inviteTitle()}</Field.Legend>
					<Field.Description>{$LL.organization.dashboard.inviteDescription()}</Field.Description>
					<div>
						<!-- the verb's glyph before its label, as every primary here carries one. -->
						<Button type="button" data-invite-open onclick={() => openOrganizationDialog('invite')}>
							<UserPlusIcon class="size-4" />
							{$LL.organization.dashboard.invite()}
						</Button>
					</div>
				</Field.Set>

				<Separator />

				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.invitations()}</Field.Legend>
					<OrganizationInvitations
						invitations={invitationsQuery.data ?? []}
						members={membersQuery.data ?? []}
						{canInvite}
						{revoking}
						onRevoke={(invitationId) => void revoke(invitationId)}
					/>
				</Field.Set>
			{/if}

			{#if needsAuthority}
				<Separator />

				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.authorityTitle()}</Field.Legend>
					<OrganizationReconnectAuthority onReconnected={() => void stateQuery.refetch()} />
				</Field.Set>
			{/if}

			{#if isOwner}
				<Separator />

				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.linkTitle()}</Field.Legend>
					<OrganizationLink {isOwner} />
				</Field.Set>
			{/if}

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.organization.dashboard.workspaces()}</Field.Legend>
				<!-- gated as the rail's row is, with the rail's sentences: an owner whose machine lost
				     the authority sees the reconnect notice above and no create, rather than a create
				     the shell refuses, and reads why. -->
				<OrganizationWorkspaces
					workspaces={session.workspaces}
					canCreate={canCreateWorkspace}
					refusal={canCreateWorkspace
						? null
						: isOwner
							? $LL.layout.workspaceMenu.workspaceRefusedAuthority()
							: $LL.layout.workspaceMenu.workspaceRefusedOwner()}
				/>
			</Field.Set>
		</Field.Group>
	</PageFrame>

	<!-- the ordinary removal asks once and says what it does not do: nothing on the member's
	     machine is taken back. The lock-out asks with the cost read first, and names how many
	     others stop syncing, because turso revokes per database and totally. -->
	<DeleteDialog
		open={removing !== null}
		onOpenChange={(open) => {
			if (!open) removing = null;
		}}
		onSubmit={confirmRemoval}
		record={removingName}
		title={removing?.lockOut
			? $LL.organization.dashboard.removeAndLockOut()
			: $LL.organization.dashboard.remove()}
		description={removing?.lockOut
			? lockOutDescription
			: $LL.organization.dashboard.removeDescription()}
		confirmLabel={removing?.lockOut
			? $LL.organization.dashboard.removeAndLockOut()
			: $LL.organization.dashboard.remove()}
		confirmLoadingLabel={$LL.common.actions.working()}
		blockers={removing?.lockOut && !lockOutCost.data ? AWAITING_BLOCKERS : undefined}
	/>
{/if}
