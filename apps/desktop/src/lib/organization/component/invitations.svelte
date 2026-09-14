<script lang="ts">
	import type { OrganizationMember, PendingInvitation } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * The pending accounts: every member waiting on an invitation, and where theirs stands.
	 *
	 * An account is made at invite and is pending until its first sign-in (requirement 22 of
	 * effort 824), so each row names the member by the one username the account was made with.
	 * An invitation expires and the link does not: a lapsed one is shown as lapsed rather than
	 * gone, so an administrator sees why a person could not get in and reissues from the member's
	 * row.
	 *
	 * **The rows are read off the members list**, which has carried each member's unspent
	 * invitation since effort 826; a member who has signed in carries none and is not here. *This
	 * took a list of its own, from a call of its own, until then.*
	 */
	let {
		members,
		canInvite,
		revoking,
		onRevoke
	}: {
		members: OrganizationMember[];
		canInvite: boolean;
		revoking: string | null;
		onRevoke: (invitationId: string) => void;
	} = $props();

	const pending = $derived(
		members.flatMap((member) =>
			member.pending ? [{ username: member.username, invitation: member.pending }] : []
		)
	);

	const standingLabel = (standing: PendingInvitation['standing']) =>
		({
			open: $LL.organization.dashboard.standingOpen(),
			lapsed: $LL.organization.dashboard.standingLapsed(),
			consumed: $LL.organization.dashboard.standingConsumed()
		})[standing];
</script>

<div class="space-y-4" data-pending-accounts>
	{#if pending.length === 0}
		<p class="text-sm text-muted-foreground">{$LL.organization.dashboard.noPendingAccounts()}</p>
	{/if}

	{#each pending as { username, invitation } (invitation.invitationId)}
		<Field.Field orientation="responsive" data-invitation={invitation.standing}>
			<Field.Content>
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<p class="truncate text-sm font-medium" data-pending-username>{username}</p>
					<Badge variant={invitation.standing === 'open' ? 'secondary' : 'outline'}>
						{standingLabel(invitation.standing)}
					</Badge>
				</div>
				<Field.Description>
					<span dir="ltr">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
				</Field.Description>
			</Field.Content>

			{#if canInvite}
				<Button
					variant="outline"
					size="sm"
					class="shrink-0"
					disabled={revoking !== null}
					onclick={() => onRevoke(invitation.invitationId)}
				>
					{revoking === invitation.invitationId
						? $LL.common.actions.working()
						: $LL.organization.dashboard.revoke()}
				</Button>
			{/if}
		</Field.Field>
	{/each}
</div>
