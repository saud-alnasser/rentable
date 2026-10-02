<script lang="ts">
	import type { OrganizationSession } from '$lib/organization/host';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { memberRoleName } from '$lib/organization/role/role';
	import { accountInitials } from '$lib/sync';

	/**
	 * Who is in: the account section's first card, drawn as its header alone.
	 *
	 * **Identity is a header, not a row** (effort 846, *Everything in a tab is a card*): every
	 * account page the research read leads with the person, larger than a setting and led by their
	 * picture, rather than listing them as one setting among others. So the card's glyph is the
	 * avatar with the two letters the rail's account control and a member's card draw, its title is
	 * the username, its line the organization, and its end the role, as a badge.
	 *
	 * The username, the role and the organization are what the member's own row says, opened with
	 * the content key their vault holds; the username is the whole of what names them, with no
	 * address and no display name beside it (requirement 21 of effort 824).
	 *
	 * **Signing out is not here.** It is in this machine's row menu in the machines card, confirmed
	 * ([[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirements 2 and 8):
	 * the account reads as who is signed in first. *It was a button beside the username until
	 * effort 846, and a card of its own, last, until ticket 46 of it.*
	 */
	let { session }: { session: OrganizationSession } = $props();

	const roleLabel = $derived(memberRoleName($LL, session));
</script>

{#snippet avatar()}
	<Avatar.Root class="size-10 rounded-full">
		<Avatar.Fallback class="rounded-full text-sm font-medium">
			{accountInitials(session.username)}
		</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

{#snippet role()}
	<Badge variant="secondary" data-identity-role><bdi>{roleLabel}</bdi></Badge>
{/snippet}

<div data-identity={session.memberId} class="contents">
	<SettingsGroup
		media={avatar}
		title={session.username}
		titleAsWritten
		description={session.organizationName}
		value={role}
	/>
</div>
