<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationForgetAccount from '$lib/organization/setup/component/forget-account.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/setup/component/reconnect-authority.svelte';
	import DatabaseIcon from '@lucide/svelte/icons/database';

	/**
	 * The organization's Turso account as this machine holds it: the owner's group in the
	 * organization section, which the area draws for the owner alone.
	 *
	 * **A connection, read as one** (effort 846, requirement 13), the way both vendors show a
	 * connected account: one row naming the account and its state on this machine. Where the
	 * machine holds the authority the row reads *connected on this machine*, and forgetting it is
	 * the group's end row, in the error tone and confirmed (`forget-account.svelte`). Where it does
	 * not, the row reads *not held here* and carries the reconnect (`reconnect-authority.svelte`),
	 * and there is nothing to forget, so the group has no end.
	 *
	 * **The group's one line is what the reader needs before the act**: what the token is, where
	 * it is held, or, where it is not, that the authority follows the account that granted it and
	 * how it comes back (effort 828, requirement 22).
	 *
	 * *It was a legend over a paragraph or two and one outline button until effort 846; the
	 * reconnect carried no glyph and the forget looked like every benign act on the page.*
	 */
	let {
		holdsAuthority,
		onReconnected
	}: {
		/** whether this machine holds the Turso authority: the owner's, after a consent. */
		holdsAuthority: boolean;
		/** the consent was granted again here, and the machine's standing wants reading again. */
		onReconnected: () => void;
	} = $props();
</script>

{#snippet forget()}
	<OrganizationForgetAccount />
{/snippet}

<div data-turso-account={holdsAuthority ? 'held' : 'not-held'}>
	<SettingsGroup
		footer={holdsAuthority
			? $LL.organization.dashboard.forgetAccountDescription()
			: `${$LL.organization.dashboard.authorityFollowsTheAccount()} ${$LL.organization.dashboard.authorityDescription()}`}
		end={holdsAuthority ? forget : undefined}
	>
		{#snippet rows()}
			{#if holdsAuthority}
				<SettingsRow
					icon={DatabaseIcon}
					name={$LL.organization.dashboard.authorityTitle()}
					value={$LL.organization.dashboard.authorityConnected()}
				/>
			{:else}
				<OrganizationReconnectAuthority {onReconnected} />
			{/if}
		{/snippet}
	</SettingsGroup>
</div>
