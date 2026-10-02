<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/organization/host';
	import type { Standing } from '$lib/permission';
	import Empty from '@rentable/design/block/empty.svelte';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { CreateControl } from '$lib/create/ui';
	import { toCardActions } from '$lib/act';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { WorkspaceActContext, WorkspaceActRecord } from '$lib/organization/workspace/acts';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import { toWorkspaceDirectory } from '$lib/organization/directory';
	import { workspaceActs, workspaceHost } from '$lib/organization/host.svelte';
	import { recordOf, withSection, WORKSPACE_PARAM } from '$lib/settings';
	import EarlierRecords from './app-database-records.svelte';
	import DiscIcon from '$lib/design/cell/disc.svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import UsersIcon from '@lucide/svelte/icons/users';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import { permits, WRITE_FLAGS } from '@rentable/workspace-permission';

	/**
	 * The workspaces of the organization, as a directory of record cards, each carrying its own
	 * file.
	 *
	 * **One card per workspace, the shape the members section takes** (effort 828, requirement
	 * 21): `design/block/record-card.svelte`, the card is the record, its own quiet control carries
	 * the acts, and the context gesture offers the same list ([[rules/interface]], *Record card
	 * actions*). *It was a row with a cluster of glyphs revealed on hover until this ticket, which
	 * is what the human met in the running build and asked to be cards instead.*
	 *
	 * **A card is a tile: the name on its heading line, and its facts beneath, one to a line, each
	 * with its icon** ([[rules/interface]], *List presentation*). The one open on this machine says
	 * so in words, *open on this machine*, after the solid disc this application draws for
	 * something live; every card says how many people hold it, after `users`; and every card says
	 * what the reader may do there, from the session's own entry for that workspace, worded as what
	 * they may do: *owner*, *you may read* where the grant is read only or nothing the reader holds
	 * there writes, *set for you* where something is pinned for them there, and *you may edit*
	 * otherwise. Never *full access* or *no access*, which the member's card does not say either.
	 * *Effort 843 took the open word and the access line off the card, leaving the disc alone, and
	 * this reverses it at the human's choice of 2026-10-02 (effort 846, requirement 16): a card
	 * read on its own has to say which one is here and what it lets the reader do, without the
	 * shell's header beside it.*
	 *
	 * **The heading takes the settings group's treatment, and the tray and the cards stay**
	 * (effort 846, requirement 1): the directory is not a group of rows, so only its title reads as
	 * one.
	 *
	 * **Activating a card opens its record** ([[rules/interface]], *Row activation*). A workspace
	 * has no page, so what opening one means is that workspace's edit, and the card's `href` is
	 * this section's address with the workspace named on it. The address is consumed on arrival
	 * and cleared, the way the members directory consumes a member, so pressing the same card twice
	 * opens the same surface twice. The rule records this as its accepted deviation, dated
	 * 2026-09-17: in the settings directories a record's page is its sheet.
	 *
	 * **The acts are declared once, in `workspace/acts.ts`**, and a card's menu and context menu
	 * are that list's projection (effort 832, requirement 8). What an act opens is the organization
	 * host's, mounted once in the frame, so this section draws cards and mounts nothing an act
	 * opens. *It built its own list and mounted the rename, the members dialog and the delete, and
	 * the settings route handed it a callback per act.*
	 *
	 * **What a card opens is the members and access surface, and the name only where that is all
	 * this reader has.** The access is the edit every card carries, and the name belongs to the
	 * open workspace alone, so keying the card on the name would make the same gesture mean one
	 * thing on one card and another on the next.
	 *
	 * **Every gate is a prop, and none of them is a permission read here.** Creating and deleting a
	 * workspace are the owner's in Rust (`require_owner`), so they are drawn from who is reading
	 * and what this machine holds rather than from a bit on the row; renaming and granting are
	 * acts, read by the area from the session and handed down.
	 *
	 * **The name is the open workspace's alone.** `sync.rename` calls this machine's
	 * workspace something else, and there is no command that renames one from a distance, so the
	 * entry on another card would rename the wrong thing. Whoever holds `renameWorkspace` edits
	 * the name of the workspace they are in, from the card that says it is open.
	 *
	 * **Each act reads as one plain word**, and the sentence that explains it belongs to the
	 * surface it opens rather than to the entry. *edit*, *members* and *delete* are the words the
	 * rail and every other list here already use, drawn from the keys that hold them, so the same
	 * thing is called the same thing wherever a screen draws it (effort 826, requirement 18; effort
	 * 832, requirement 6, which made the name's entry *edit* where it read *rename*).
	 *
	 * **The directory is searched and ordered from the list shell's own bar** (effort 832,
	 * requirement 7), the members section's shape: the same field, wait and `/` as every set, and
	 * an order by name or by how many people hold it.
	 *
	 * **A workspace is made from the tray above the cards**, on the shared form surface
	 * ([[rules/interface]], *Form surface*), and the tray is the members section's, which is the
	 * contracts view's shape. An owner whose machine lost the Turso authority reads why there is no
	 * control, in its place; everybody else is offered neither, since creating was never theirs to
	 * be refused.
	 *
	 * **A workspace's file moves from its own card** (effort 846, requirement 15): *export* and
	 * *import* are acts on every card, after members, whether or not the workspace is open here,
	 * and each is refused, with the reason, by what the reader may do in that workspace rather than
	 * in the one open (`standingOf`). The organization host runs them, as it runs every act.
	 * *A block beneath the cards moved the open workspace alone, under a legend naming it, until
	 * then; a person switched workspaces to export another.*
	 *
	 * **The earlier records stand above the cards** (effort 846, requirement 17), naming the
	 * workspace open here that they would fill, since that is the one they go into.
	 */
	let {
		workspaces,
		members,
		openWorkspaceId,
		canCreate,
		canDelete,
		canRename,
		canGrantWorkspace,
		isOwner,
		standingOf,
		refusal
	}: {
		/** the workspaces this member holds a grant on, which is what the session carries. */
		workspaces: OrganizationWorkspace[];
		/** everybody in the organization, for the count on a card. */
		members: OrganizationMember[];
		/** the workspace open on this machine, by the id the organization knows it under. */
		openWorkspaceId: string | null;
		/** whether this person, on this machine, may create: the owner holding the authority. */
		canCreate: boolean;
		/** whether this person may delete a workspace: the owner, refused again in Rust. */
		canDelete: boolean;
		/** whether the reader's row carries `renameWorkspace`. */
		canRename: boolean;
		/** whether the reader's row carries `grantWorkspace`. */
		canGrantWorkspace: boolean;
		/** whether the reader owns the organization, which is what every card then says they are. */
		isOwner: boolean;
		/** where the reader stands in a workspace, by its id, which its file's acts are refused by. */
		standingOf: (workspaceId: string) => Standing | null;
		/**
		 * why there is no create control, for an owner whose machine lost the Turso authority;
		 * `null` for the owner who holds it and for everybody else, who is offered nothing and
		 * told nothing, since creating was never theirs to be refused.
		 */
		refusal: string | null;
	} = $props();

	// this section's own address, resolved once. A card's is it with the workspace named on it,
	// which is the whole of what a card's `href` is ([[rules/frontend]]: the path is the caller's
	// to resolve, and the packaged card takes one already resolved).
	const sectionAddress = resolve(withSection('workspaces'));

	const addressOf = (workspaceId: string) =>
		`${sectionAddress}&${WORKSPACE_PARAM}=${encodeURIComponent(workspaceId)}`;

	/** how many people hold a grant on a workspace, counted off the organization's own list. */
	const memberCount = (workspaceId: string) =>
		members.filter((member) => member.workspaces.some((held) => held.id === workspaceId)).length;

	const open = $derived(workspaces.find((workspace) => workspace.id === openWorkspaceId) ?? null);

	/**
	 * what the reader may do in a workspace, read off the session's own entry for it. The owner
	 * first, since nothing is pinned or withheld from them; then a read-only grant; then anything
	 * pinned for the reader there; then whether anything they hold there writes at all, so a role
	 * that only views reads *you may read* under a full grant rather than an edit it cannot make.
	 */
	const accessOf = (workspace: OrganizationWorkspace) => {
		if (isOwner)
			return { kind: 'owner', word: $LL.organization.dashboard.workspaceYouOwn(), icon: CrownIcon };
		if (workspace.accessLevel === 'read-only')
			return { kind: 'read', word: $LL.organization.dashboard.workspaceYouRead(), icon: EyeIcon };
		if (workspace.pinned !== 0)
			return {
				kind: 'pinned',
				word: $LL.organization.dashboard.workspaceSetForYou(),
				icon: UserCogIcon
			};
		if (!WRITE_FLAGS.some((flag) => permits(workspace.permissions, flag)))
			return { kind: 'read', word: $LL.organization.dashboard.workspaceYouRead(), icon: EyeIcon };

		return { kind: 'edit', word: $LL.organization.dashboard.workspaceYouEdit(), icon: PencilIcon };
	};

	let search = $state('');
	// the empty treatment at a settings section's size: a directory here is one block among
	// others, so it takes no screen's worth of padding.
	const DIRECTORY_EMPTY = 'h-auto flex-none gap-3 rounded-2xl border border-dashed p-4 md:p-6';
	let sort = $state<ListSort | null>(null);

	const sortOptions = $derived([
		{ id: 'name', label: $LL.common.labels.name() },
		{ id: 'members', label: $LL.organization.dashboard.membersTitle() }
	]);

	const shown = $derived(toWorkspaceDirectory(workspaces, search, sort, memberCount));

	/** what every workspace act is gated on, read once for the whole directory. */
	const context = $derived<WorkspaceActContext>({
		openWorkspaceId,
		canRename,
		canGrantWorkspace,
		canDelete,
		standingOf
	});

	const recordOfWorkspace = (workspace: OrganizationWorkspace): WorkspaceActRecord => ({
		workspace,
		context
	});

	// the workspace the address names is opened and then cleared out of the address, the way the
	// members directory consumes an account: left there, a reload would reopen a surface the person
	// has already dismissed, and pressing the same card a second time would navigate nowhere.
	$effect(() => {
		const named = recordOf(page.url, WORKSPACE_PARAM);

		if (!named) return;

		const workspace = workspaces.find((candidate) => candidate.id === named);

		// a list still on its way is empty: the address keeps its name until the list can answer
		// for it, and this runs again when it arrives.
		if (!workspace && workspaces.length === 0) return;

		// the two edits are gated separately, so what a workspace's edit *is* depends on who is
		// looking: who holds it for somebody who may grant it, its name for somebody who may only
		// edit the one they are in. A reader holding neither opens nothing, and the card still reads.
		if (workspace) {
			const record = recordOfWorkspace(workspace);

			if (!workspaceHost.run('workspace.members', record))
				workspaceHost.run('workspace.edit', record);
		}

		void goto(sectionAddress, { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<!--
	the section's one primary, last in the tray above the cards (requirement 21): the one create
	control every set draws in the same place ([[rules/interface]], *Create*). The form that names a
	new workspace is the shared one mounted in the shell, and the organization host opens it.
-->
{#snippet newWorkspace()}
	<CreateControl
		label={$LL.layout.workspaceMenu.create()}
		onCreate={() => workspaceHost.create()}
		data-workspace-create
	/>
{/snippet}

<!-- what stands where the control would have been, for the owner whose machine lost the authority:
     the refusal is about the act, so it is read where the act is looked for. -->
{#snippet authorityRefused()}
	<p class="max-w-sm text-xs text-muted-foreground" data-workspace-refusal>{refusal}</p>
{/snippet}

<!-- the tray and its cards are one thing, so they sit at the list's own rhythm rather than at the
     fieldset's, which spaces one block of settings from the next. -->
<Field.Set class="gap-3" aria-labelledby="workspaces-legend">
	<DirectoryTray
		legendId="workspaces-legend"
		legend={$LL.settings.section.workspaces()}
		grouped
		description={$LL.organization.dashboard.workspacesDescription()}
		bind:search
		count={shown.length}
		{sortOptions}
		bind:sort
		action={canCreate ? newWorkspace : refusal ? authorityRefused : undefined}
	/>

	<!-- the records an earlier version left on this machine, offered until they are brought in or
	     dismissed, above the cards and naming the open one they go into (effort 838, requirement
	     18; effort 846, requirement 17). -->
	<EarlierRecords workspace={open} />

	<div class="flex flex-col gap-3" data-workspaces>
		{#if workspaces.length === 0}
			<Empty
				kind="nothing-yet"
				title={$LL.organization.dashboard.noWorkspaces()}
				class={DIRECTORY_EMPTY}
			/>
		{:else if shown.length === 0}
			<!-- the one empty treatment's no-match ([[rules/interface]], *Empty*): the search found
			     nobody, and the way out is putting it down. -->
			<div data-directory-no-match>
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

		{#each shown as workspace (workspace.id)}
			<!-- the card is the record and takes no mark of its own, so the workspace it stands for is
			     named on the element that holds it, which is what this section is read by. -->
			<div data-workspace={workspace.id}>
				<RecordCard
					href={addressOf(workspace.id)}
					label={workspace.name}
					actions={toCardActions(workspaceActs, recordOfWorkspace(workspace), $LL)}
					layout="tile"
				>
					{#snippet heading()}
						<span class="truncate text-sm font-medium" data-workspace-name>
							<bdi>{workspace.name}</bdi>
						</span>
					{/snippet}

					{#snippet content()}
						{@const access = accessOf(workspace)}
						<!-- the facts, one to a line and each after its icon, the way a tile reads. The
						     open one leads, in the disc the rail's switcher marks it with and the words
						     that say what the disc means, so neither has to be learned. -->
						<ul class="pointer-events-none relative flex min-w-0 flex-col gap-1 text-xs">
							{#if workspace.id === openWorkspaceId}
								<li
									class="flex min-w-0 items-center gap-2 font-medium text-foreground"
									data-workspace-open={workspace.id}
								>
									<DiscIcon class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
									<span class="truncate">{$LL.organization.dashboard.workspaceOpenHere()}</span>
								</li>
							{/if}

							<li
								class="flex min-w-0 items-center gap-2 text-muted-foreground"
								data-workspace-members={workspace.id}
							>
								<UsersIcon class="size-3.5 shrink-0" aria-hidden="true" />
								<span class="truncate">
									{$LL.layout.workspaceMenu.members({ count: memberCount(workspace.id) })}
								</span>
							</li>

							<li
								class="flex min-w-0 items-center gap-2 text-muted-foreground"
								data-workspace-access={workspace.id}
								data-access={access.kind}
							>
								<access.icon class="size-3.5 shrink-0" aria-hidden="true" />
								<span class="truncate">{access.word}</span>
							</li>
						</ul>
					{/snippet}
				</RecordCard>
			</div>
		{/each}
	</div>
</Field.Set>
