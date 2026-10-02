<script lang="ts">
	import type { OrganizationSession } from '$lib/organization/host';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { memberRoleName } from '$lib/organization/role/role';
	import CircleUserIcon from '@lucide/svelte/icons/circle-user';

	/**
	 * Who is in: the account section's first group, one row.
	 *
	 * The username, the role and the organization are what the member's own row says, opened
	 * with the content key their vault holds; the username is the whole of what names them, with
	 * no address and no display name beside it (requirement 21 of effort 824). The row leads with
	 * the account section's own glyph rather than the two-letter avatar the rail draws, because
	 * every settings row leads with a glyph and the rail already shows the avatar.
	 *
	 * **Signing out is not here.** It is the last group of the section, on its own, in the error
	 * tone ([[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirements 2 and
	 * 8): the account reads as who is signed in first and the way out last. *It was a button beside
	 * the username until effort 846.*
	 */
	let { session }: { session: OrganizationSession } = $props();

	const roleLabel = $derived(memberRoleName($LL, session));
</script>

<div data-identity={session.memberId}>
	<SettingsGroup title={$LL.settings.you.signedInAs()}>
		{#snippet rows()}
			<SettingsRow icon={CircleUserIcon} name={session.username}>
				{#snippet value()}
					<span class="flex min-w-0 items-center gap-2">
						<Badge variant="secondary"><bdi>{roleLabel}</bdi></Badge>
						<span class="truncate" data-identity-organization>{session.organizationName}</span>
					</span>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>
</div>
