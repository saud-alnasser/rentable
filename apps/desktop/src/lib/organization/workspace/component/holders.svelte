<script lang="ts" module>
	import type { MemberStanding, OrganizationMember } from '$lib/organization/host';
	import type { RecordCardAction } from '@rentable/design/block/record-card.svelte';

	/**
	 * one member who holds a workspace, as their card draws them: who they are, their role's name,
	 * where their account stands, whether what they may do there is tailored, and the acts on them
	 * there.
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
	import { LL } from '$lib/i18n/i18n-svelte';
	import { columnsFor, RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import MemberCard, { MEMBER_TILE_HEIGHT } from '$lib/organization/member/component/card.svelte';

	/**
	 * Who holds a workspace, on the workspace's page (effort 846, ticket 50, at the human's word of
	 * 2026-10-03: "a grid of cards sohwen to existing members and have elipses as action for them
	 * regarding the workspace").
	 *
	 * **A member card each, the members directory's own** (`member/component/card.svelte`): the
	 * initials, the username, the role's badge and the tinted fields, at the tile height the card
	 * declares (`MEMBER_TILE_HEIGHT`), as many to a row as there is room for at the record tiles'
	 * width (`columnsFor`, `RECORD_TILE_MIN_WIDTH`), in source order. The foot says *custom here*
	 * where what the member may do in this workspace is tailored. A card opens the member's own
	 * card in the members section, as *open member* does.
	 *
	 * **The card's menu holds the acts on the member here** (`declareHolderActs` in
	 * `../acts.ts`): open member, tailor access here, and remove from workspace, red and asked
	 * first, each refused with its reason where the reader may not. What they open is the
	 * organization host's, so this draws cards and mounts nothing.
	 *
	 * **With nobody in it, the empty block says so** ([[rules/interface]], *Empty*); the way to put
	 * somebody in is the field above it. *Each was a tile with a large switch, in or out, until this
	 * ticket.*
	 */
	let { cards }: { cards: HolderCard[] } = $props();

	/** the gap between two tiles, the list shell's `gap-3`. */
	const TILE_GAP = 12;
	let width = $state(0);
	const columns = $derived(columnsFor(width, RECORD_TILE_MIN_WIDTH, TILE_GAP));

	// the empty treatment at a settings section's size, as the members directory draws its own.
	const HOLDERS_EMPTY = 'h-auto flex-none gap-3 rounded-2xl border border-dashed p-4 md:p-6';
</script>

<div
	class="grid gap-3"
	style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
	bind:clientWidth={width}
	data-holders
	data-columns={columns}
>
	{#if cards.length === 0}
		<div class="col-span-full" data-holders-empty>
			<Empty
				kind="nothing-yet"
				title={$LL.organization.workspacePage.nobodyHolds()}
				class={HOLDERS_EMPTY}
			/>
		</div>
	{/if}

	{#each cards as card (card.member.id)}
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
</div>
