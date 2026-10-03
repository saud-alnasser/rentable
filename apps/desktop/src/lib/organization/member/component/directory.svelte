<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { MemberStanding, OrganizationMember } from '$lib/organization/host';
	import Empty from '@rentable/design/block/empty.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { CreateControl } from '$lib/create/ui';
	import { toCardActions } from '$lib/act';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { columnsFor, RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import { lacking } from '$lib/organization/role/acts';
	import { toMemberActContext, type MemberActRecord } from '$lib/organization/member/acts';
	import MemberCard, { MEMBER_TILE_HEIGHT } from '$lib/organization/member/component/card.svelte';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import { toMemberDirectory } from '$lib/organization/directory';
	import { memberActs, memberHost, memberPending } from '$lib/organization/host.svelte';
	import { memberRoleName } from '$lib/organization/role/role';
	import { recordOf, withSection } from '$lib/settings';
	import { memberCardOf } from '$lib/organization/member/address';
	import UsersIcon from '@lucide/svelte/icons/users';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Everybody in the organization, as a directory of record cards.
	 *
	 * **One card per member, the way every other record here is shown** (effort 828, requirement
	 * 19). The shape is `complex/component/directory.svelte`'s over
	 * `design/block/record-card.svelte`: the card is the record, its own quiet control carries the
	 * acts, and the context gesture offers the same list ([[rules/interface]], *Record card
	 * actions*). *It was a list of rows with a hover cluster, and then rows with one visible
	 * control; the human saw the second in the running build and chose cards instead.*
	 *
	 * **The cards are tiles in a grid, two or three across where there is room** (effort 846,
	 * ticket 32, the human's walk of 2026-10-02: "like the other records shows more data better").
	 * The columns are read off the directory's own width by the list shell's rule (`columnsFor`,
	 * `RECORD_TILE_MIN_WIDTH`), as the workspaces directory reads them, and every tile stands at the
	 * height its component declares (`MEMBER_TILE_HEIGHT`). What a tile says is `./card.svelte`'s:
	 * the person, then their password, machine, workspaces and joining as facts. *It was one wide
	 * card per row, saying the standing as one sentence and the workspaces as a count.* Which
	 * workspaces somebody holds, and what each one is good for, is a section of the sheet the card
	 * opens, which lists every workspace with what they hold on it before it offers a change.
	 *
	 * **The standing gates nothing.** A member holds no password until their first link is opened,
	 * and the register (requirement 15) says whether a machine is signed in for them. The tile says
	 * where the account stands and nothing more: a link is offered on every card this reader may
	 * write, whatever it reads. *The line was also why the link act was absent until the human
	 * ruled one machine per account out on 2026-09-20.*
	 *
	 * **Activating a card opens its record** ([[rules/interface]], *Row activation*). A member has
	 * no page, so what opening one means is the member's sheet, and the card's `href` is this
	 * section's address with the member named on it. The address is consumed on arrival and
	 * cleared, the way a concept's host consumes a create intent (`create/intent.svelte.ts`),
	 * so pressing the same card twice opens the same surface twice. The rule records this as its accepted
	 * deviation, dated 2026-09-17: in the settings directories a record's page is its sheet.
	 *
	 * **The acts are declared once, in `member/acts.ts`**, and a card's menu and context menu
	 * are that list's projection (effort 832, requirement 8), as every domain concept's are. What
	 * an act opens or runs is the organization host's, mounted once in the frame, so this section
	 * draws cards and mounts nothing an act opens. *It built its own list and mounted the sheet, the
	 * rename and the handover, and the settings route handed it a callback per act.*
	 *
	 * **What a card opens is one sheet** (requirement 23 of effort 828), and its one entry is
	 * `edit`: a member's name, role, what they are also allowed beyond it, and the workspaces they
	 * hold are one person's standing. *The name was a second entry, `rename`, beside the edit until
	 * effort 832 settled one verb per act.*
	 *
	 * **An act the session lacks is absent from the menu, not disabled.** Each gate is drawn from
	 * the reader's own permissions and refused again in Rust on the signed row. **An act the reader
	 * holds on somebody at or above their own rank is drawn refused, with that reason**, and so is
	 * the edit on the reader's own card (effort 838, requirement 12).
	 *
	 * **Each act reads as one or two plain words**, and the sentence that explains it belongs to
	 * the surface it opens rather than to the entry: a menu is read at a glance, and *role and
	 * permissions* was a heading standing in for a verb.
	 *
	 * **The owner is removed by nobody and edited by nobody, and nobody edits their own
	 * role, permissions or workspaces** (requirement 19). So the owner's card carries one act and
	 * no other: handing the organization over (requirement 22), which is the owner's own and is
	 * absent for everybody else, so a manager meets that card with no menu and no gesture at
	 * all. **That one act is two, and never both at once**: offering the organization while no
	 * offer stands, and withdrawing the one that does. A reader's own card is the same: a member's
	 * name, role and workspaces are given by somebody else, and Rust refuses each of the three on
	 * the row of whoever is asking.
	 *
	 * **Removal has two speeds, and the ordinary one leads.** Removing stops renewing: the
	 * member's credential runs out within its lifetime and nobody else notices. Locking out rotates
	 * every workspace they held and stops everybody else in those workspaces until their
	 * application reconnects; it is the owner's, drawn under the remove, because it is chosen
	 * rather than fallen into. Both open the confirm the host raises, which reads the cost.
	 *
	 * **The directory is searched and ordered from the list shell's own bar** (effort 832,
	 * requirement 7): the same field, wait and `/` as every set, and an order by username or by
	 * role. The narrowing is `organization/directory.ts`'s, over the members the session already
	 * holds.
	 *
	 * **A member is made from the tray above the cards**, on the shared form surface
	 * ([[rules/interface]], *Form surface*). The tray is the contracts view's shape, which is what
	 * the human asked for on seeing this section: the section's name and sentence at one end of a
	 * bar, its one primary at the other, and the records below. *The primary sat under the last
	 * card until that look.*
	 *
	 * **What each role may do is the roles block's**, beside this directory in the same section
	 * (effort 838, requirement 12). *It was a read-only table opened from this tray until the roles
	 * became records of their own.*
	 */
	let {
		members,
		standings,
		canInvite,
		canRemove,
		canLockOut,
		canRename,
		canReset,
		canAssignRole,
		canOverride,
		canGrantWorkspace,
		isOwner,
		selfId,
		rank,
		permissions
	}: {
		members: OrganizationMember[];
		/** where each member stands, joined to the members on the member's id. */
		standings: MemberStanding[];
		/**
		 * whether the reader's row carries `inviteMember`: the add, and the link with `canReset`.
		 * The link act is offered to a holder of either, as `invite::make_link` and the router
		 * admit either: a reset is a fresh way in, and whoever may hand one out may hand out the
		 * link that carries it (effort 828, requirement 20; the human's word at review round one).
		 */
		canInvite: boolean;
		/** whether the reader's row carries `removeMember`. */
		canRemove: boolean;
		/** whether the reader is the owner, which is who a lock-out is for. */
		canLockOut: boolean;
		/** whether the reader's row carries `renameMember`. */
		canRename: boolean;
		/** whether the reader's row carries `resetPassword`, which is what a reset is held to. */
		canReset: boolean;
		/** whether the reader's row carries `assignRole`. */
		canAssignRole: boolean;
		/** whether the reader's row carries `overrideMember`. */
		canOverride: boolean;
		/** whether the reader's row carries `grantWorkspace`. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner: signing acts and read-only grants are theirs alone. */
		isOwner: boolean;
		/** the reader's own member id, whose card offers nothing that writes it. */
		selfId: string;
		/** how high the reader's role stands: a card at or above it is written by somebody else. */
		rank: number;
		/** what the reader may do, which bounds what they may give. */
		permissions: number;
	} = $props();

	// the address of the section this directory sits in, resolved once. A card's is it with the
	// member named on it (`memberCardOf`), which is the whole of what a card's `href` is
	// ([[rules/frontend]]: the path is the caller's to resolve, and the packaged card takes one
	// already resolved).
	const sectionAddress = resolve(withSection('organization'));

	const roleLabel = (member: OrganizationMember) => memberRoleName($LL, member);

	const standingOf = (memberId: string) =>
		standings.find((standing) => standing.memberId === memberId) ?? null;

	/**
	 * what every member act is gated on, read once for the whole directory, through the builder the
	 * command menu reads it through too: who is reading, what their row carries, where the handover
	 * stands, and which writes are still running.
	 */
	const context = $derived(
		toMemberActContext(
			{
				selfId,
				isOwner,
				rank,
				permissions,
				canInvite,
				canReset,
				canRemove,
				canLockOut,
				canRename,
				canAssignRole,
				canOverride,
				canGrantWorkspace
			},
			members,
			standings,
			memberPending()
		)
	);

	const recordOfMember = (member: OrganizationMember): MemberActRecord => ({
		member,
		context,
		standing: standingOf(member.id)
	});

	// the member the address names is opened and then cleared out of the address, the way a
	// concept's host consumes a create intent: left there, a reload would reopen a surface the
	// person has already dismissed, and pressing the same card a second time would navigate nowhere.
	$effect(() => {
		const named = recordOf(page.url);

		if (!named) return;

		const member = members.find((candidate) => candidate.id === named);

		// a list still on its way is empty, and an organization has an owner: the address keeps
		// its name until the list can answer for it, and this runs again when it arrives.
		if (!member && members.length === 0) return;

		// what the card opens is its edit, where this reader holds one; the card still reads for a
		// reader who holds none, and the host refuses an act the member does not admit.
		if (member) memberHost.run('member.edit', recordOfMember(member));

		void goto(sectionAddress, { replaceState: true, noScroll: true, keepFocus: true });
	});

	/** the gap between two tiles, the list shell's `gap-3`. */
	const TILE_GAP = 12;
	/** the directory's own width, which the tiles divide. */
	let width = $state(0);
	const columns = $derived(columnsFor(width, RECORD_TILE_MIN_WIDTH, TILE_GAP));

	let search = $state('');
	// the empty treatment at a settings section's size: a directory here is one block among
	// others, so it takes no screen's worth of padding.
	const DIRECTORY_EMPTY = 'h-auto flex-none gap-3 rounded-2xl border border-dashed p-4 md:p-6';
	let sort = $state<ListSort | null>(null);

	const sortOptions = $derived([
		{ id: 'username', label: $LL.organization.dashboard.username() },
		{ id: 'role', label: $LL.organization.dashboard.role() }
	]);

	const shown = $derived(toMemberDirectory(members, search, sort, roleLabel));
</script>

<!--
	the section's one primary, in the tray above the cards (requirement 19). Quiet and glyph-only
	with its words in a tooltip and on the control itself, which is how the contracts view offers
	the same thing: a directory is read before anything is added to it, so the control that adds is
	discoverable without competing with the records (*Semantics are secondary*, Refactoring UI
	p.60). The form is the shell's, opened the same way the rail's row opens it.
-->
{#snippet trayActions()}
	<!-- last in the tray, where every set offers its create ([[rules/interface]], *Create*). -->
	{#if canInvite}
		<!-- an account is made with its grant on the organization database, which only a holder of
		     `grantWorkspace` signs (effort 838, the row-kind table), so the add says so where the
		     reader lacks it. -->
		<CreateControl
			label={$LL.organization.dashboard.addMember()}
			onCreate={() => memberHost.create()}
			unavailable={canGrantWorkspace ? undefined : lacking($LL, 'grantWorkspace')}
			data-invite-open
		/>
	{/if}
{/snippet}

<!-- the tray and its cards are one thing, so they sit at the list's own rhythm rather than at the
     fieldset's, which spaces one block of settings from the next. -->
<Field.Set class="gap-3" aria-labelledby="members-legend">
	<DirectoryTray
		legendId="members-legend"
		legend={$LL.organization.dashboard.membersTitle()}
		grouped
		icon={UsersIcon}
		description={$LL.organization.dashboard.membersDescription()}
		bind:search
		count={shown.length}
		{sortOptions}
		bind:sort
		action={trayActions}
	/>

	<!-- the tiles in a grid, as many to a row as there is room for at 300 pixels each and never
	     more than three, read off the directory's own width the way the list shell reads its
	     own (`columnsFor`), in source order. -->
	<div
		class="grid gap-3"
		style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
		bind:clientWidth={width}
		data-members
		data-columns={columns}
	>
		{#if members.length > 0 && shown.length === 0}
			<!-- the one empty treatment's no-match ([[rules/interface]], *Empty*): the search found
			     nobody, and the way out is putting it down. -->
			<div class="col-span-full" data-directory-no-match>
				<Empty kind="no-match" title={$LL.common.messages.noMatch()} class={DIRECTORY_EMPTY}>
					{#snippet action()}
						<Button type="button" variant="outline" size="sm" onclick={() => (search = '')}>
							<XIcon />
							{$LL.common.actions.clearSearch()}
						</Button>
					{/snippet}
				</Empty>
			</div>
		{/if}

		{#each shown as member (member.id)}
			<!-- the card is the record and takes no mark of its own, so the member it stands for is
			     named on the element that holds it, which is what this section is read by. It stands
			     at the tile's declared height, so every tile in a row is the same. -->
			<div data-member={member.id} style:height="{MEMBER_TILE_HEIGHT}px">
				<MemberCard
					{member}
					standing={standingOf(member.id)}
					role={roleLabel(member)}
					href={memberCardOf(member.id)}
					actions={toCardActions(memberActs, recordOfMember(member), $LL)}
				/>
			</div>
		{/each}
	</div>
</Field.Set>
