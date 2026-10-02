<script lang="ts">
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationReconnectAuthority from '$lib/organization/setup/component/reconnect-authority.svelte';
	import DatabaseIcon from '@lucide/svelte/icons/database';

	/**
	 * The organization's Turso account as this machine holds it: one row of an owner's leaving
	 * card (`organization/component/leaving.svelte`), which the area draws for the owner alone.
	 *
	 * **A connection, read as one** (effort 846, requirement 13), the way both vendors show a
	 * connected account: the row is named for the account, and its value is its state on this
	 * machine. Where the machine holds the authority the row reads *connected on this machine*,
	 * and what the account holds for this organization folds under it (*Detail that few readers
	 * need folds under its row*); forgetting it is an ending row of the same card
	 * (`forget-account.svelte`). Where it does not, the row is `reconnect-authority.svelte`'s,
	 * reading *not held here* with the reconnect, and there is nothing to forget.
	 *
	 * *It was a card of its own, titled for the account, until ticket 38 of effort 846, when the
	 * human found it said what the leaving card's disconnect says ("tusro account section
	 * shoud'nt be there since disconnect this meachine does the same") and asked for it to be
	 * folded into leaving.*
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

{#if holdsAuthority}
	<SettingsRow
		icon={DatabaseIcon}
		name={$LL.organization.dashboard.authorityTitle()}
		value={$LL.organization.dashboard.authorityConnected()}
		details={held}
		detailsLabel={$LL.organization.dashboard.authorityDetail.label()}
		detailsKey="organization.turso.detail"
		data-turso-account="held"
	/>
{:else}
	<OrganizationReconnectAuthority {onReconnected} />
{/if}
