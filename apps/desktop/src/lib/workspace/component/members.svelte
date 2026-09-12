<script lang="ts">
	import type { OrganizationMember } from '$lib/platform/host';
	import { resolve } from '$app/paths';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import UsersGroupIcon from '@tabler/icons-svelte/icons/users-group';

	/**
	 * Who holds a grant on this workspace, read off the organization.
	 *
	 * *It drew the one Google account and a locked invite control until the control plane
	 * retired, with a sentence promising that inviting anybody else would arrive with
	 * organizations. It arrived: the members are the organization's, the grants are what says
	 * who is in this workspace, and inviting and granting are the organization page's.*
	 */
	let {
		members,
		workspaceId
	}: {
		members: OrganizationMember[];
		/** the workspace that is open, by the id the organization knows it under. */
		workspaceId: string | null;
	} = $props();

	const holding = $derived(
		workspaceId ? members.filter((member) => member.workspaceIds.includes(workspaceId)) : []
	);

	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;
</script>

<div class="space-y-4" data-workspace-members>
	{#each holding as member (member.id)}
		<Field.Field orientation="responsive">
			<Field.Content>
				<div class="flex min-w-0 items-center gap-3">
					<Avatar.Root class="size-10 shrink-0 rounded-full">
						<Avatar.Fallback class="rounded-full text-xs">
							{accountInitials(member.displayName || member.email)}
						</Avatar.Fallback>
					</Avatar.Root>
					<div class="grid min-w-0 gap-1">
						<div class="flex min-w-0 flex-wrap items-center gap-2">
							<p class="truncate text-sm font-medium">{member.displayName}</p>
							<Badge variant="secondary">{roleLabel(member.role)}</Badge>
						</div>
						{#if member.email}
							<p class="truncate text-sm text-muted-foreground" dir="ltr">{member.email}</p>
						{/if}
					</div>
				</div>
			</Field.Content>
		</Field.Field>
	{/each}

	<Field.Field orientation="responsive">
		<Field.Content>
			<Field.Description>{$LL.workspace.membersDescription()}</Field.Description>
		</Field.Content>
		<Button variant="outline" size="sm" class="shrink-0" href={resolve('/organization')}>
			<UsersGroupIcon class="size-4 shrink-0" />
			{$LL.common.nav.organization()}
		</Button>
	</Field.Field>
</div>
