<script lang="ts" module>
	/**
	 * how many links the card shows before the rest scroll inside it, and the most there are before
	 * it offers a search (effort 851, at the human's word on a long list): four rows are read at a
	 * glance, and past four a link is looked for rather than read.
	 */
	export const VISIBLE_LINK_ROWS = 4;
</script>

<script lang="ts">
	import type { OutstandingLink } from '$lib/organization/host';
	import { toLinkList } from '$lib/organization/directory';
	import { SearchField } from '$lib/list/ui';
	import { Button } from '@rentable/design/primitive/button/index.js';
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
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The links waiting to be opened, in the organization tab (effort 851, at the human's word:
	 * "there should be a menu to manage invites to revoke them from the app for who has the
	 * permissions for it").
	 *
	 * **A card, a row per link**, as the account tab lists the reader's machines: the row is named
	 * for the member it is for, its glyph and the line under the name say what opening it does
	 * (joins as a new member, chooses a new password, adds a machine), when it lapses in the
	 * reader's own words, and who made it where the row records one. A link is made from the
	 * member's card, so this card holds no act of its own; with nothing waiting it says so and says
	 * where a link comes from.
	 *
	 * **The soonest to lapse leads**, two lapsing together by username (`toLinkList`), since the
	 * link about to run out is the one that wants a word or a revoke. *It kept the shell's order,
	 * the newest first, until the human's word on a long list.*
	 *
	 * **A long list stays a card's length** (the same word): `VISIBLE_LINK_ROWS` rows are in view
	 * and the rest scroll inside the card, the settings card's own bounded rows (`rowsInView`), so
	 * the cards under it are not pushed off the tab. The header says how many there are at its end,
	 * the place a settings card puts a count; past four the card offers the one search field
	 * between its header and its rows, finding a link by the username it is for, and a search that
	 * finds nothing says so in the one empty treatment with the way out that clears it
	 * ([[rules/interface]], *Search*, *Empty*), as the members directory beside it does. The count
	 * then says how many the search found. The directory's tray is not drawn here: it heads a
	 * collection of cards with its own legend and an order, and this card already has a header and
	 * one order, so a second heading and a sort control would say nothing. The field leaves `/` to
	 * the members directory, which a reader searches more.
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
		/** the links waiting to be opened, as `organization.member.links` lists them, in any order. */
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

	/** the username the reader is looking for, once they stopped typing. */
	let search = $state('');

	/** whether the list is long enough to be looked through rather than read. */
	const searchable = $derived(links.length > VISIBLE_LINK_ROWS);

	// a list that shrinks to four or fewer drops its search, and what it held with it, so no row is
	// hidden behind a field that is no longer there.
	$effect(() => {
		if (!searchable) search = '';
	});

	const shown = $derived(toLinkList(links, searchable ? search : ''));

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
	{#each shown as link (link.id)}
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
		value={links.length > 0 ? linkCount : undefined}
		bar={searchable ? searchBar : undefined}
		rows={shown.length > 0 ? linkRows : undefined}
		rowsInView={VISIBLE_LINK_ROWS}
		footer={links.length === 0 ? nothingWaiting : shown.length === 0 ? noMatch : undefined}
	/>
</div>

{#snippet linkCount()}
	<!-- said again as a search narrows it, as the list shell's count is. -->
	<span aria-live="polite" data-links-count>
		{$LL.organization.links.count({ count: shown.length })}
	</span>
{/snippet}

{#snippet searchBar()}
	<!-- the one search field, finding a link by the username it is for. -->
	<SearchField
		bind:value={search}
		answersSearchKey={false}
		placeholder={$LL.organization.links.searchPlaceholder()}
		class="sm:max-w-none"
	/>
{/snippet}

{#snippet noMatch()}
	<!-- the one empty treatment's no-match ([[rules/interface]], *Empty*): the search found no
	     link, and the way out is putting it down. -->
	<div data-links-no-match>
		<Empty kind="no-match" title={$LL.common.messages.noMatch()} class="p-2 md:p-2">
			{#snippet action()}
				<Button type="button" variant="outline" size="sm" onclick={() => (search = '')}>
					<XIcon />
					{$LL.common.actions.clearSearch()}
				</Button>
			{/snippet}
		</Empty>
	</div>
{/snippet}

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
