<script lang="ts">
	import type { OrganizationInvitation, OrganizationMember } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * The pending accounts: every invitation and where it stands, open, lapsed, or used.
	 *
	 * An account is made at invite and is pending until its first sign-in (requirement 22 of
	 * effort 824), so each row names the member by the one username the account was made with.
	 * An invitation expires and the link does not: a lapsed one is shown as lapsed rather than
	 * gone, so an administrator sees why a person could not get in and reissues from the member's
	 * row. Revoking is offered on an unused one only; a used one is history.
	 */
	let {
		invitations,
		members,
		canInvite,
		revoking,
		onRevoke
	}: {
		invitations: OrganizationInvitation[];
		members: OrganizationMember[];
		canInvite: boolean;
		revoking: string | null;
		onRevoke: (invitationId: string) => void;
	} = $props();

	const usernameOf = (id: string) => {
		const member = members.find((candidate) => candidate.id === id);

		return member ? member.username : id;
	};

	const standingLabel = (standing: OrganizationInvitation['standing']) =>
		({
			open: $LL.organization.dashboard.standingOpen(),
			lapsed: $LL.organization.dashboard.standingLapsed(),
			consumed: $LL.organization.dashboard.standingConsumed()
		})[standing];
</script>

<div class="space-y-4" data-pending-accounts>
	{#if invitations.length === 0}
		<p class="text-sm text-muted-foreground">{$LL.organization.dashboard.noPendingAccounts()}</p>
	{/if}

	{#each invitations as invitation (invitation.id)}
		<Field.Field orientation="responsive" data-invitation={invitation.standing}>
			<Field.Content>
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<p class="truncate text-sm font-medium" data-pending-username>
						{usernameOf(invitation.memberId)}
					</p>
					<Badge variant={invitation.standing === 'open' ? 'secondary' : 'outline'}>
						{standingLabel(invitation.standing)}
					</Badge>
				</div>
				<Field.Description>
					<span dir="ltr">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
				</Field.Description>
			</Field.Content>

			{#if canInvite && invitation.standing !== 'consumed'}
				<Button
					variant="outline"
					size="sm"
					class="shrink-0"
					disabled={revoking !== null}
					onclick={() => onRevoke(invitation.id)}
				>
					{revoking === invitation.id
						? $LL.common.actions.working()
						: $LL.organization.dashboard.revoke()}
				</Button>
			{/if}
		</Field.Field>
	{/each}
</div>
