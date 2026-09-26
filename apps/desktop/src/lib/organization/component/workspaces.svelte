<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
	import Empty from '@rentable/design/block/empty.svelte';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import CreateControl from '$lib/design/block/create-control.svelte';
	import { toCardActions } from '$lib/design/acts';
	import type { ListSort } from '@rentable/design/sort.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { WorkspaceActContext, WorkspaceActRecord } from '$lib/organization/acts';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import { toWorkspaceDirectory } from '$lib/organization/directory';
	import { workspaceActs, workspaceHost } from '$lib/organization/host.svelte';
	import { recordOf, withSection, WORKSPACE_PARAM } from '$lib/settings/section';
	import WorkspaceTransfer from '$lib/workspace/component/transfer.svelte';
	import DiscIcon from '$lib/design/cell/disc.svelte';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The workspaces of the organization, as a directory of record cards, and the file that moves
	 * the open one.
	 *
	 * **One card per workspace, the shape the members section takes** (effort 828, requirement
	 * 21): `design/block/record-card.svelte`, the card is the record, its own quiet control carries
	 * the acts, and the context gesture offers the same list ([[rules/interface]], *Record card
	 * actions*). *It was a row with a cluster of glyphs revealed on hover until this ticket, which
	 * is what the human met in the running build and asked to be cards instead.*
	 *
	 * **A card says two things, and marks one**: the name, how many people hold the workspace, and
	 * a solid disc before the name of the one open on this machine, whose word reaches the reader
	 * on hover and through its accessible name ([[rules/interface]], *Status presentation*). The
	 * disc is the mark this application already draws for something live, in the tone the status
	 * treatment gives that, and the rail's switcher marks its open row the same way round: the mark
	 * carries no visible text. *The card carried the open word as a badge and this reader's access
	 * as a line of its own until the human's look at this directory: the shell says which workspace
	 * is open at the top of every screen, and what each person holds is the surface the card's menu
	 * opens rather than a fact about the card.*
	 *
	 * **Activating a card opens its record** ([[rules/interface]], *Row activation*). A workspace
	 * has no page, so what opening one means is that workspace's edit, and the card's `href` is
	 * this section's address with the workspace named on it. The address is consumed on arrival
	 * and cleared, the way the members directory consumes a member, so pressing the same card twice
	 * opens the same surface twice. The rule records this as its accepted deviation, dated
	 * 2026-09-17: in the settings directories a record's page is its sheet.
	 *
	 * **The acts are declared once, in `organization/acts.ts`**, and a card's menu and context menu
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
	 * **The name is the open workspace's alone.** `remoteSync.rename` calls this machine's
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
	 * **The transfer sits beneath the cards, under a legend naming the workspace it acts on.** It
	 * reads and writes whatever is open on this machine, which is one of the cards above, and the
	 * legend is what stops that being a guess.
	 */
	let {
		workspaces,
		members,
		openWorkspaceId,
		canCreate,
		canDelete,
		canRename,
		canGrantWorkspace,
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
		canDelete
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
		description={$LL.organization.dashboard.workspacesDescription()}
		bind:search
		count={shown.length}
		{sortOptions}
		bind:sort
		action={canCreate ? newWorkspace : refusal ? authorityRefused : undefined}
	/>

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
					class="gap-4 py-3"
				>
					{#snippet content()}
						<div class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1 text-start">
							<div class="flex min-w-0 items-center gap-2">
								<!-- the one open here, as a disc before its name, in the rail's own word for
								     it: a reader meets the same word in the switcher and here. It is the
								     mark and the tone this application gives something live, and it carries
								     no visible text, so a directory of five workspaces reads as five names
								     with one of them marked rather than as a column of labels
								     ([[rules/interface]], *Status presentation*). `pointer-events-auto` for
								     the reason the count cell carries it: the card lays its link over its
								     content, and the tooltip has to be reachable through it. -->
								{#if workspace.id === openWorkspaceId}
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}
												<span
													{...props}
													class="pointer-events-auto flex shrink-0 items-center text-primary"
													data-workspace-open={workspace.id}
												>
													<DiscIcon class="size-4" aria-hidden="true" />
													<span class="sr-only">{$LL.layout.workspaceMenu.open()}</span>
												</span>
											{/snippet}
										</Tooltip.Trigger>
										<Tooltip.Content side="top" sideOffset={6}>
											{$LL.layout.workspaceMenu.open()}
										</Tooltip.Content>
									</Tooltip.Root>
								{/if}

								<span class="truncate text-sm font-medium" data-workspace-name>
									<bdi>{workspace.name}</bdi>
								</span>
							</div>

							<!-- how many people are in it, the one line the rail's own header carries under
							     the same name. What each of them holds is the surface the menu opens. -->
							<span
								class="truncate text-xs text-muted-foreground"
								data-workspace-members={workspace.id}
							>
								{$LL.layout.workspaceMenu.members({ count: memberCount(workspace.id) })}
							</span>
						</div>
					{/snippet}
				</RecordCard>
			</div>
		{/each}
	</div>
</Field.Set>

<!-- beneath the cards, and named for the workspace it acts on: a file is written from what is open
     on this machine, which is one of the cards above. Drawn only where there is one, since there is
     nothing to write out of a machine that has opened none. -->
{#if open}
	<Separator />

	<Field.Set>
		<Field.Legend>
			{$LL.organization.dashboard.transferTitle({ workspace: open.name })}
		</Field.Legend>
		<WorkspaceTransfer />
	</Field.Set>
{/if}
