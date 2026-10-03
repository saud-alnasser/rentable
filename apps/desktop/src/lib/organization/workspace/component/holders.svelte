<script lang="ts" module>
	import type { MemberStanding, OrganizationMember } from '$lib/organization/host';
	import type { RecordCardAction } from '@rentable/design/block/record-card.svelte';

	/**
	 * one member who holds a workspace, as their card draws them: who they are, their role's name,
	 * where their account stands, whether what they may do there is tailored, where pressing the
	 * card goes, and the acts on them there.
	 */
	export type HolderCard = {
		member: OrganizationMember;
		role: string;
		standing: MemberStanding | null;
		tailored: boolean;
		href: string;
		actions: RecordCardAction[];
	};
</script>

<script lang="ts">
	import Empty from '@rentable/design/block/empty.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import type { ListSort } from '@rentable/design/sort.js';
	import { CreateControl } from '$lib/create/ui';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import DirectoryGrid from '$lib/organization/component/directory-grid.svelte';
	import { toMemberDirectory } from '$lib/organization/directory';
	import MemberCard, { MEMBER_TILE_HEIGHT } from '$lib/organization/member/component/card.svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Who holds a workspace, on the workspace's page, as a record directory (effort 846, ticket 51,
	 * at the human's walk of 2026-10-03: "in a workspace the details page it has a searchbar
	 * filter,sort add button on the tray; then grid of cards like now").
	 *
	 * **The tray is the settings directories' own** (`organization/component/directory-tray.svelte`,
	 * the list shell's bar): the heading in the settings card's manner, then the search, which
	 * narrows by username or role name as the members directory's does (`toMemberDirectory`), the
	 * count, the order by username or by role, and last the plus (`create/component/control.svelte`),
	 * which asks the page for its add sheet and is refused with its reason (`addRefusal`).
	 *
	 * **A member card each, the members directory's own** (`member/component/card.svelte`): the
	 * initials, the username, the role's badge and the tinted fields, at the tile height the card
	 * declares (`MEMBER_TILE_HEIGHT`), as many to a row as there is room for at the record tiles'
	 * width (`columnsFor`, `RECORD_TILE_MIN_WIDTH`). The foot says *custom here* where what the
	 * member may do in this workspace is tailored. Pressing a card goes to its `href`, the page with
	 * the member named on it, which the page consumes by opening *edit permissions*; its menu holds
	 * the acts on the member here (`declareHolderActs` in `../acts.ts`). What they open is the
	 * organization host's, so this draws cards and mounts nothing.
	 *
	 * **With nobody in it, the empty block says so**, and a search that finds nobody says that,
	 * with the way out ([[rules/interface]], *Empty*). *The cards stood under a field that found a
	 * member and put them in at once, with no tray, until this ticket.*
	 */
	let {
		cards,
		description,
		addRefusal = null,
		onAdd
	}: {
		cards: HolderCard[];
		/** the one sentence under the heading, naming the workspace. */
		description: string;
		/** why the reader may put nobody in, or `null` where they may. */
		addRefusal?: string | null;
		/** ask the page for its add sheet. */
		onAdd: () => void;
	} = $props();

	let search = $state('');
	let sort = $state<ListSort | null>(null);

	const sortOptions = $derived([
		{ id: 'username', label: $LL.organization.dashboard.username() },
		{ id: 'role', label: $LL.organization.dashboard.role() }
	]);

	const shown = $derived.by(() => {
		const roleOf = (member: OrganizationMember) =>
			cards.find((card) => card.member.id === member.id)?.role ?? '';

		return toMemberDirectory(
			cards.map((card) => card.member),
			search,
			sort,
			roleOf
		).flatMap((member) => cards.filter((card) => card.member.id === member.id));
	});

	// the empty treatment at a settings section's size, as the members directory draws its own.
	const HOLDERS_EMPTY = 'h-auto flex-none gap-3 rounded-2xl border border-dashed p-4 md:p-6';
</script>

{#snippet trayActions()}
	<!-- last in the tray, where every set offers its create ([[rules/interface]], *Create*). -->
	<CreateControl
		label={$LL.organization.workspacePage.addMembers()}
		onCreate={onAdd}
		unavailable={addRefusal ?? undefined}
		data-holders-add
	/>
{/snippet}

<Field.Set class="gap-3" aria-labelledby="holders-legend" data-workspace-holders>
	<DirectoryTray
		legendId="holders-legend"
		legend={$LL.organization.dashboard.membersTitle()}
		grouped
		icon={UsersIcon}
		{description}
		bind:search
		count={shown.length}
		{sortOptions}
		bind:sort
		action={trayActions}
	/>

	<!-- the settings directories' grid, up to three across and with no cap: the members are the
	     page's only collection, so the page's own scroll is theirs (effort 846, ticket 53). -->
	<DirectoryGrid
		count={shown.length}
		tileHeight={MEMBER_TILE_HEIGHT}
		labelledBy="holders-legend"
		data-holders
	>
		{#if cards.length === 0}
			<div class="col-span-full" data-holders-empty>
				<Empty
					kind="nothing-yet"
					title={$LL.organization.workspacePage.nobodyHolds()}
					class={HOLDERS_EMPTY}
				/>
			</div>
		{:else if shown.length === 0}
			<!-- the search found nobody, and the way out is putting it down. -->
			<div class="col-span-full" data-holders-no-match>
				<Empty kind="no-match" title={$LL.common.messages.noMatch()} class={HOLDERS_EMPTY}>
					{#snippet action()}
						<Button type="button" variant="outline" size="sm" onclick={() => (search = '')}>
							<XIcon />
							{$LL.common.actions.clearSearch()}
						</Button>
					{/snippet}
				</Empty>
			</div>
		{/if}

		{#each shown as card (card.member.id)}
			<div data-holder={card.member.id} style:height="{MEMBER_TILE_HEIGHT}px">
				<MemberCard
					member={card.member}
					standing={card.standing}
					role={card.role}
					href={card.href}
					actions={card.actions}
					tailoredHere={card.tailored}
				/>
			</div>
		{/each}
	</DirectoryGrid>
</Field.Set>
