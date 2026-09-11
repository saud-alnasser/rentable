<script lang="ts">
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * Who is in the organization, as the replica says once every row has been verified.
	 *
	 * Names and addresses arrive opened by the vault this process holds; a role is what the
	 * member's signed row says, never what this machine remembers. The reissue control is the
	 * reset (requirement 13): a fresh vault under a fresh password, built from what the reissuer
	 * already holds, offered to whoever carries `inviteMember` and never for the owner.
	 */
	let {
		members,
		workspaces,
		canInvite,
		reissuing,
		onReissue
	}: {
		members: OrganizationMember[];
		workspaces: OrganizationWorkspace[];
		canInvite: boolean;
		/** the member whose invitation is being reissued, while it is. */
		reissuing: string | null;
		onReissue: (memberId: string) => void;
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

			{#if canInvite && member.role !== 'owner'}
				<Button
					variant="outline"
					size="sm"
					class="shrink-0"
					disabled={reissuing !== null}
					onclick={() => onReissue(member.id)}
				>
					<RefreshCwIcon class="size-4" />
					{reissuing === member.id
						? $LL.common.actions.working()
						: $LL.organization.dashboard.resetPassword()}
				</Button>
			{/if}
		</Field.Field>
	{/each}
</div>
