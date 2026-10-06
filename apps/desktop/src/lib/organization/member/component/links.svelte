<script lang="ts">
	import type { OutstandingLink } from '$lib/organization/host';
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import Empty from '@rentable/design/block/empty.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow, { type SettingsRowMenu } from '@rentable/design/block/settings-row.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleTimeUntil } from '$lib/platform/locale';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import Link2OffIcon from '@lucide/svelte/icons/link-2-off';
	import LinkIcon from '@lucide/svelte/icons/link';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * The links waiting to be opened, in the organization tab (effort 851, at the human's word:
	 * "there should be a menu to manage invites to revoke them from the app for who has the
	 * permissions for it").
	 *
	 * **A card, a row per link**, as the account tab lists the reader's machines: the row is named
	 * for the member it is for, its glyph and the line under the name say what opening it does
	 * (joins as a new member, chooses a new password, adds a machine), when it lapses in the
	 * reader's own words, and who made it where the row records one. The newest first, as the shell
	 * answers them. A link is made from the member's card, so this card holds no act of its own; with
	 * nothing waiting it says so and says where a link comes from.
	 *
	 * **A link is revoked from its row's menu**, the settings row's record menu, as a machine is
	 * signed out from its row ([[contexts/desktop/components]], *a secondary act on a row of a
	 * growing list*), in the menu's default tone. It asks first in the confirm dialog named for the
	 * act, naming the member and saying that the link and its code stop working at once and that a
	 * new link from their card brings them in ([[rules/interface]], *Delete and confirm*). The list
	 * reads itself again once it went, so the row leaves.
	 *
	 * **Who sees it is the section's to decide**: a holder of `inviteMember` or `resetPassword`, and
	 * not while locked, which is who the shell answers. This draws the list it is given.
	 */
	let {
		links,
		onRevoke
	}: {
		/** the links waiting to be opened, newest first, as `organization.member.links` lists them. */
		links: OutstandingLink[];
		/** revoke one; rejects with what the shared handler has said. */
		onRevoke: (linkId: string) => Promise<void>;
	} = $props();

	// the clock the lapse is read against, moved once a minute, the finest unit it says.
	let now = $state(Date.now());

	$effect(() => {
		const tick = window.setInterval(() => {
			now = Date.now();
		}, 60_000);

		return () => window.clearInterval(tick);
	});

	const GLYPHS = { join: UserPlusIcon, reset: KeyRoundIcon, machine: LaptopIcon } as const;

	/** what opening the link does, in the reader's words. */
	const purposeOf = (link: OutstandingLink) => $LL.organization.links[link.purpose]();

	/** the line under the member's name: what it does, when it lapses, and who made it. */
	const metaOf = (link: OutstandingLink) =>
		[
			purposeOf(link),
			$LL.organization.links.lapses({
				moment: formatLocaleTimeUntil($locale, link.expiresAt, now)
			}),
			link.madeBy ? $LL.organization.links.madeBy({ username: link.madeBy }) : null
		]
			.filter((part) => part !== null)
			.join(' · ');

	/** the link whose revoke is being asked about, or `null` while nothing is. */
	let revoking = $state<OutstandingLink | null>(null);

	const menuOf = (link: OutstandingLink): SettingsRowMenu => ({
		label: $LL.organization.links.menu({ username: link.username }),
		attributes: { 'data-link-menu': link.id },
		acts: [
			{
				label: $LL.organization.links.revoke(),
				icon: Link2OffIcon,
				attributes: { 'data-revoke-link': link.id },
				onSelect: () => {
					revoking = link;
				}
			}
		]
	});
</script>

{#snippet linkRows()}
	{#each links as link (link.id)}
		<!-- named for the member it is for, as they wrote their username. -->
		<SettingsRow icon={GLYPHS[link.purpose]} name={link.username} nameAsWritten menu={menuOf(link)}>
			{#snippet meta()}
				<span data-link={link.id} data-link-purpose={link.purpose}>{metaOf(link)}</span>
			{/snippet}
		</SettingsRow>
	{/each}
{/snippet}

<div data-links class="contents">
	<!-- the rows while anything waits, and the empty block in the footer while nothing does. -->
	<SettingsGroup
		icon={LinkIcon}
		title={$LL.organization.links.title()}
		description={$LL.organization.links.description()}
		rows={links.length > 0 ? linkRows : undefined}
		footer={links.length === 0 ? nothingWaiting : undefined}
	/>
</div>

{#snippet nothingWaiting()}
	<Empty
		kind="nothing-yet"
		title={$LL.organization.links.noneTitle()}
		description={$LL.organization.links.noneDescription()}
		class="p-2 md:p-2"
	/>
{/snippet}

<ConfirmDialog
	open={revoking !== null}
	onOpenChange={(open) => {
		if (!open) revoking = null;
	}}
	onSubmit={() => (revoking ? onRevoke(revoking.id) : undefined)}
	record={revoking?.username}
	title={$LL.organization.links.revoke()}
	description={$LL.organization.links.confirmDescription()}
	confirmLabel={$LL.organization.links.confirmLabel()}
	confirmLoadingLabel={$LL.common.actions.working()}
	tone="error"
/>
