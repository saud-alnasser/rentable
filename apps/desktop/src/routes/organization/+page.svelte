<script lang="ts">
	import type { Invited } from '$lib/platform/tauri';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationInviteForm from '$lib/organization/component/invite-form.svelte';
	import OrganizationInvitations from '$lib/organization/component/invitations.svelte';
	import OrganizationMembers from '$lib/organization/component/members.svelte';
	import OrganizationLink from '$lib/organization/component/organization-link.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/component/reconnect-authority.svelte';
	import OrganizationWorkspaces from '$lib/organization/component/workspaces.svelte';
	import {
		useCreateWorkspace,
		useFetchInvitations,
		useFetchMembers,
		useFetchOrganizationState,
		useInviteMember,
		useLockOutCost,
		useReissueInvitation,
		useRemoveMember,
		useRevokeInvitation
	} from '$lib/organization/query';
	import { toast } from 'svelte-sonner';
	import { permits } from '@rentable/workspace-permission';

	/**
	 * The administration dashboard: who is in, who is invited, and the workspaces.
	 *
	 * **What a person may do here is what their verified row carries**, read off the session the
	 * shell holds, and every control is refused again in Rust on the same row. Inviting is drawn
	 * for whoever carries `inviteMember`; creating a workspace is drawn for the owner and explained
	 * to everybody else, because it needs the Turso authority only the owner's machine holds and
	 * the spec puts no request queue behind it.
	 *
	 * **No loading branch and no empty branch, for the reason the workspace page gives**: a page
	 * inside the shell is drawn past admission, so the session is there before this is.
	 */
	const stateQuery = useFetchOrganizationState();
	const membersQuery = useFetchMembers();
	const invitationsQuery = useFetchInvitations();
	const inviteMember = useInviteMember();
	const reissueInvitation = useReissueInvitation();
	const revokeInvitation = useRevokeInvitation();
	const createWorkspace = useCreateWorkspace();
	const removeMember = useRemoveMember();

	const session = $derived(stateQuery.data?.session ?? null);
	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && stateQuery.data?.holdsTursoAuthority === false);
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

		return member ? member.displayName || member.email : removing.memberId;
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

	let invited = $state<Invited | null>(null);
	let copied = $state<'link' | 'password' | null>(null);
	let reissuing = $state<string | null>(null);
	let revoking = $state<string | null>(null);

	const invite = async (
		email: string,
		displayName: string,
		role: 'administrator' | 'member',
		workspaceIds: string[]
	) => {
		try {
			invited = await inviteMember.mutateAsync({ email, displayName, role, workspaceIds });
			copied = null;
		} catch {
			// said by the shared handler; the form keeps what was typed.
		}
	};

	const reissue = async (memberId: string) => {
		reissuing = memberId;

		try {
			invited = await reissueInvitation.mutateAsync({ memberId });
			copied = null;
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

	const copy = async (what: 'link' | 'password', value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			copied = what;
		} catch {
			copied = null;
		}
	};

	const create = async (name: string) => {
		try {
			await createWorkspace.mutateAsync({ name });
			await stateQuery.refetch();
		} catch {
			// said by the shared handler.
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
					selfId={session.memberId}
					{reissuing}
					onReissue={(memberId) => void reissue(memberId)}
					onRemove={(memberId) => {
						removing = { memberId, lockOut: false };
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
					<OrganizationInviteForm
						workspaces={session.workspaces}
						canInviteAdministrators={isOwner}
						isInviting={inviteMember.isPending}
						{invited}
						{copied}
						onInvite={(email, displayName, role, workspaceIds) =>
							void invite(email, displayName, role, workspaceIds)}
						onCopy={(what, value) => void copy(what, value)}
						onDismiss={() => {
							invited = null;
							copied = null;
						}}
					/>
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
				<OrganizationWorkspaces
					workspaces={session.workspaces}
					canCreate={isOwner}
					isCreating={createWorkspace.isPending}
					onCreate={(name) => void create(name)}
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
