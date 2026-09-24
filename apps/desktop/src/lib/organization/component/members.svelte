<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { MemberStanding, OrganizationMember } from '$lib/platform/tauri';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { toCardActions } from '$lib/design/acts';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import type { MemberActContext, MemberActRecord } from '$lib/organization/acts';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import { toMemberDirectory } from '$lib/organization/directory';
	import RoleTable from '$lib/organization/component/role-table.svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import { memberActs, memberHost, memberPending } from '$lib/organization/host.svelte';
	import { RECORD_PARAM, recordOf, withSection } from '$lib/settings/section';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

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
	 * **A card says four things**: the username with the role beside it, one line of standing, and
	 * one line saying how many workspaces they hold. *Each workspace was a chip carrying its own
	 * access until the human's second look, which put a second list along the bottom of every
	 * card; which workspaces somebody holds, and what each one is good for, is a section of the
	 * sheet the card opens, which lists every workspace with what they hold on it before it offers
	 * a change.*
	 *
	 * **The standing is two facts, read as a sentence, and it gates nothing.** A member holds no
	 * password until their first link is opened, and the register (requirement 15) says whether a
	 * machine is signed in for them. The line says where the account stands and nothing more: a
	 * link is offered on every card this reader may write, whichever of the three it reads.
	 * *The line was also why the link act was absent until the human ruled one machine per account
	 * out on 2026-09-20.*
	 *
	 * **Activating a card opens its record** ([[rules/interface]], *Row activation*). A member has
	 * no page, so what opening one means is the member's sheet, and the card's `href` is this
	 * section's address with the member named on it. The address is consumed on arrival and
	 * cleared, the way `complex/component/directory.svelte` consumes its create intent, so pressing
	 * the same card twice opens the same surface twice. The rule records this as its accepted
	 * deviation, dated 2026-09-17: in the settings directories a record's page is its sheet.
	 *
	 * **The acts are declared once, in `organization/acts.ts`**, and a card's menu and context menu
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
	 * the reader's own permissions and refused again in Rust on the signed row.
	 *
	 * **Each act reads as one or two plain words**, and the sentence that explains it belongs to
	 * the surface it opens rather than to the entry: a menu is read at a glance, and *role and
	 * permissions* was a heading standing in for a verb.
	 *
	 * **The owner is removed by nobody and edited by nobody, and nobody edits their own
	 * role, permissions or workspaces** (requirement 19). So the owner's card carries one act and
	 * no other: handing the organization over (requirement 22), which is the owner's own and is
	 * absent for everybody else, so an administrator meets that card with no menu and no gesture at
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
	 * **What each role may do is read from the tray too**, beside the add and as quiet as it
	 * (requirement 23). The comparison is documentation rather than a control, so it sits next to
	 * the directory rather than inside the chooser that picks a role, and it is the one surface
	 * this section mounts.
	 */
	let {
		members,
		standings,
		canInvite,
		canRemove,
		canLockOut,
		canRename,
		canReset,
		canChangeRole,
		canGrantWorkspace,
		isOwner,
		selfId
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
		/** whether the reader's row carries `changeRole`. */
		canChangeRole: boolean;
		/** whether the reader's row carries `grantWorkspace`. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner: signing acts and read-only grants are theirs alone. */
		isOwner: boolean;
		/** the reader's own member id, whose card offers nothing that writes it. */
		selfId: string;
	} = $props();

	// the address of the section this directory sits in, resolved once. A card's is it with the
	// member named on it, which is the whole of what a card's `href` is ([[rules/frontend]]: the
	// path is the caller's to resolve, and the packaged card takes one already resolved).
	const sectionAddress = resolve(withSection('organization'));

	const addressOf = (memberId: string) =>
		`${sectionAddress}&${RECORD_PARAM}=${encodeURIComponent(memberId)}`;

	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;

	const standingOf = (memberId: string) =>
		standings.find((standing) => standing.memberId === memberId) ?? null;

	/**
	 * the one line a card carries about where a member stands, and the mark its test reads it by.
	 *
	 * `null` until the standings have been answered: the list of people is drawn either way, and a
	 * line guessed from nothing would say *no machine signed in* about a member somebody is
	 * working on.
	 */
	const standingLine = (memberId: string) => {
		const standing = standingOf(memberId);

		if (!standing) return null;

		if (!standing.passwordSet) {
			return { kind: 'no-password', text: $LL.organization.dashboard.standingNoPassword() };
		}

		return standing.machineSignedIn
			? { kind: 'signed-in', text: $LL.organization.dashboard.standingSignedIn() }
			: { kind: 'no-machine', text: $LL.organization.dashboard.standingNoMachine() };
	};

	/**
	 * the members the organization could be offered to: everybody but the owner's own row, and
	 * nobody whose password is not set yet.
	 *
	 * A removed member is not in this list either, because the members query does not answer one.
	 * A member with no password of their own has no vault to derive the organization's next key
	 * from, which is what Rust refuses such an offer by name for; this is the earlier refusal, and
	 * it is what keeps the chooser from offering a choice that cannot go through. A member whose
	 * standing has not been answered yet is left out too: an offer drawn from nothing would name
	 * somebody Rust refuses.
	 */
	const offerable = $derived(
		members
			.filter((member) => member.role !== 'owner' && standingOf(member.id)?.passwordSet === true)
			.map((member) => ({ id: member.id, username: member.username }))
	);

	/**
	 * what every member act is gated on, read once for the whole directory: who is reading, what
	 * their row carries, where the handover stands, and which writes are still running.
	 */
	const context = $derived<MemberActContext>({
		selfId,
		isOwner,
		canInvite,
		canReset,
		canRemove,
		canLockOut,
		canRename,
		canChangeRole,
		canGrantWorkspace,
		offerStands: members.some((member) => member.offeredOwnership),
		offerable,
		pending: memberPending()
	});

	const recordOfMember = (member: OrganizationMember): MemberActRecord => ({ member, context });

	// the member the address names is opened and then cleared out of the address, the way
	// `complex/component/directory.svelte` consumes a create intent: left there, a reload would
	// reopen a surface the person has already dismissed, and pressing the same card a second time
	// would navigate nowhere.
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

	let readingRoles = $state(false);

	let search = $state('');
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
	<!-- what each role may do, beside the add and as quiet as it (requirement 23). It is read
	     before a role is picked and writes nothing, so it stands next to the directory rather than
	     inside the chooser. -->
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					data-role-table-open
					aria-label={$LL.organization.roleTable.title()}
					onclick={() => {
						readingRoles = true;
					}}
				>
					<ListChecksIcon />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			{$LL.organization.roleTable.title()}
		</Tooltip.Content>
	</Tooltip.Root>

	{#if canInvite}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="icon-sm"
						data-invite-open
						aria-label={$LL.organization.dashboard.addMember()}
						onclick={() => openOrganizationDialog('account')}
					>
						<UserPlusIcon />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>
				{$LL.organization.dashboard.addMember()}
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
{/snippet}

<!-- the tray and its cards are one thing, so they sit at the list's own rhythm rather than at the
     fieldset's, which spaces one block of settings from the next. -->
<Field.Set class="gap-3" aria-labelledby="members-legend">
	<DirectoryTray
		legendId="members-legend"
		legend={$LL.organization.dashboard.membersTitle()}
		description={$LL.organization.dashboard.membersDescription()}
		bind:search
		count={shown.length}
		{sortOptions}
		bind:sort
		action={trayActions}
	/>

	<div class="flex flex-col gap-3" data-members>
		{#if members.length > 0 && shown.length === 0}
			<!-- the list shell's words for a search that found nothing, so the two read alike. -->
			<p class="text-sm text-muted-foreground" data-directory-no-match>
				{$LL.common.messages.noResults()}
			</p>
		{/if}

		{#each shown as member (member.id)}
			{@const standing = standingLine(member.id)}
			<!-- the card is the record and takes no mark of its own, so the member it stands for is
			     named on the element that holds it, which is what this section is read by. -->
			<div data-member={member.id}>
				<RecordCard
					href={addressOf(member.id)}
					label={member.username}
					actions={toCardActions(memberActs, recordOfMember(member), $LL)}
					class="gap-4 py-3"
				>
					{#snippet content()}
						<!-- the same disc the rail's account control and the identity block draw, with the
						     same two letters (requirement 24 of effort 824). -->
						<div class="pointer-events-none relative shrink-0">
							<Avatar.Root class="size-10 rounded-full">
								<Avatar.Fallback class="rounded-full text-xs">
									{accountInitials(member.username)}
								</Avatar.Fallback>
							</Avatar.Root>
						</div>

						<div class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1 text-start">
							<div class="flex min-w-0 flex-wrap items-center gap-2">
								<span class="truncate text-sm font-medium" data-member-username>
									{member.username}
								</span>
								<Badge variant="secondary">{roleLabel(member.role)}</Badge>
							</div>

							{#if standing}
								<span
									class="truncate text-xs text-muted-foreground"
									data-member-standing={standing.kind}
								>
									{standing.text}
								</span>
							{/if}

							<!-- how many workspaces, and not which: a card is scanned, and a chip per
						     workspace carrying its own access turned the bottom of every card into a
						     second list. Which ones and what each is good for is one press away, on the
						     surface the card's own menu opens. -->
							<span
								class="truncate text-xs text-muted-foreground"
								data-member-workspaces={member.workspaces.length}
							>
								{member.workspaces.length === 0
									? $LL.organization.dashboard.noWorkspaces()
									: $LL.organization.dashboard.workspacesHeld({
											count: member.workspaces.length
										})}
							</span>
						</div>
					{/snippet}
				</RecordCard>
			</div>
		{/each}
	</div>
</Field.Set>

<RoleTable
	open={readingRoles}
	onOpenChange={(open) => {
		readingRoles = open;
	}}
/>
