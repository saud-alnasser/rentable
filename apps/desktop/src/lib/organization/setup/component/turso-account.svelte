<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationForgetAccount from '$lib/organization/setup/component/forget-account.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/setup/component/reconnect-authority.svelte';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import Link2Icon from '@lucide/svelte/icons/link-2';

	/**
	 * The organization's Turso account as this machine holds it: the owner's group in the
	 * organization section, which the area draws for the owner alone.
	 *
	 * **A connection, read as one** (effort 846, requirement 13), the way both vendors show a
	 * connected account: a card titled for the account, and one row naming its state on this
	 * machine. Where the machine holds the authority the row reads *connected on this machine*,
	 * what the account holds for this organization folds under it (*Detail that few readers need
	 * folds under its row*), and forgetting it is the card's end row, in the error tone and
	 * confirmed (`forget-account.svelte`). Where it does not, the row reads *not held here* and
	 * carries the reconnect (`reconnect-authority.svelte`), and there is nothing to forget, so
	 * the card has no end. *The row was named for the account under a card that was too, until the
	 * card took the title.*
	 *
	 * **The card's one line is what the reader needs before the act**: what the token is, where
	 * it is held, or, where it is not, that the authority follows the account that granted it and
	 * how it comes back (effort 828, requirement 22).
	 *
	 * *It was a legend over a paragraph or two and one outline button until effort 846; the
	 * reconnect carried no glyph and the forget looked like every benign act on the page.*
	 */
	let {
		holdsAuthority,
		organizationId,
		organizationName,
		onReconnected
	}: {
		/** whether this machine holds the Turso authority: the owner's, after a consent. */
		holdsAuthority: boolean;
		/** the organization, whose own database on the account is named for its id. */
		organizationId: string;
		/** the organization's name, as the account holds it. */
		organizationName: string;
		/** the consent was granted again here, and the machine's standing wants reading again. */
		onReconnected: () => void;
	} = $props();

	/**
	 * the organization's own database on the Turso account, as the dashboard lists it: the shell
	 * names it `org-` and the organization's id when it creates it (`organization/setup/group.rs`).
	 */
	const database = $derived(`org-${organizationId}`);
</script>

{#snippet forget()}
	<OrganizationForgetAccount />
{/snippet}

<!-- what folds under the connected row: what the account holds for this organization, which an
     owner reads when they look for it on Turso's own dashboard, and nobody acts on here. -->
{#snippet held()}
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-turso-detail>
		<dt>{$LL.organization.dashboard.authorityDetail.database()}</dt>
		<dd class="min-w-0 break-all text-foreground"><bdi dir="ltr">{database}</bdi></dd>
		<dt>{$LL.organization.dashboard.authorityDetail.organization()}</dt>
		<dd class="min-w-0 text-foreground"><bdi>{organizationName}</bdi></dd>
	</dl>
{/snippet}

<div data-turso-account={holdsAuthority ? 'held' : 'not-held'} class="contents">
	<SettingsGroup
		icon={DatabaseIcon}
		title={$LL.organization.dashboard.authorityTitle()}
		description={holdsAuthority
			? $LL.organization.dashboard.forgetAccountDescription()
			: `${$LL.organization.dashboard.authorityFollowsTheAccount()} ${$LL.organization.dashboard.authorityDescription()}`}
		end={holdsAuthority ? forget : undefined}
	>
		{#snippet rows()}
			{#if holdsAuthority}
				<SettingsRow
					icon={Link2Icon}
					name={$LL.organization.dashboard.authorityConnected()}
					details={held}
					detailsLabel={$LL.organization.dashboard.authorityDetail.label()}
					detailsKey="organization.turso.detail"
				/>
			{:else}
				<OrganizationReconnectAuthority {onReconnected} />
			{/if}
		{/snippet}
	</SettingsGroup>
</div>
