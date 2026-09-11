<script lang="ts">
	import type { Invited } from '$lib/platform/tauri';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationInviteForm from '$lib/organization/component/invite-form.svelte';
	import OrganizationInvitations from '$lib/organization/component/invitations.svelte';
	import OrganizationMembers from '$lib/organization/component/members.svelte';
	import OrganizationWorkspaces from '$lib/organization/component/workspaces.svelte';
	import {
		useCreateWorkspace,
		useFetchInvitations,
		useFetchMembers,
		useFetchOrganizationState,
		useInviteMember,
		useReissueInvitation,
		useRevokeInvitation
	} from '$lib/organization/query';
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

	const session = $derived(stateQuery.data?.session ?? null);
	const isOwner = $derived(session?.role === 'owner');
	const canInvite = $derived(permits(session?.permissions ?? 0, 'inviteMember'));

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
					{reissuing}
					onReissue={(memberId) => void reissue(memberId)}
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
{/if}
