<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import AccessDialog, {
		type AccessChoice
	} from '$lib/organization/component/access-dialog.svelte';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import { recordOf, withSection, WORKSPACE_PARAM } from '$lib/settings/section';
	import WorkspaceRenameForm from '$lib/workspace/component/rename-form.svelte';
	import WorkspaceTransfer from '$lib/workspace/component/transfer.svelte';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UsersIcon from '@lucide/svelte/icons/users';
	import CircleFilledIcon from '@tabler/icons-svelte/icons/circle-filled';

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
	 * has no page, so what opening one means is this section drawing that workspace's edit, and the
	 * card's `href` is this section's address with the workspace named on it. The address is
	 * consumed on arrival and cleared, the way the members directory consumes an account, so
	 * pressing the same card twice opens the same surface twice.
	 *
	 * **What a card opens is the members and access surface, and the rename only where that is all
	 * this reader has.** The access is the edit every card carries, and the rename belongs to the
	 * open workspace alone, so keying the card on the rename would make the same gesture mean one
	 * thing on one card and another on the next.
	 *
	 * **Every gate is a prop, and none of them is a permission read here.** Creating and deleting a
	 * workspace are the owner's in Rust (`require_owner`), so they are drawn from who is reading
	 * and what this machine holds rather than from a bit on the row; renaming and granting are
	 * acts, read by the area from the session and handed down. `workspace/component/permitted.svelte`
	 * is deliberately not used: it subscribes to the open workspace's own permissions, which is a
	 * different question from what this member may do in the organization.
	 *
	 * **The rename is the open workspace's alone.** `remoteSync.rename` calls this machine's
	 * workspace something else, and there is no command that renames one from a distance, so the
	 * entry on another card would rename the wrong thing. Whoever holds `renameWorkspace` renames
	 * the workspace they are in, from the card that says it is open.
	 *
	 * **Each act reads as one plain word**, and the sentence that explains it belongs to the
	 * surface it opens rather than to the entry. *members* and *delete* are the words the rail and
	 * every other list here already use, drawn from the keys that hold them, so the same thing is
	 * called the same thing wherever a screen draws it (effort 826, requirement 18).
	 *
	 * **The members act is the access dialog read the other way round**: the rows are the people
	 * rather than the workspaces, and what comes back is a member id per row. The owner is not
	 * among them, because the organization is theirs and Rust refuses a withdrawal of their own
	 * grant, and neither is the reader, for the reason no card in the members directory writes its
	 * own.
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
		isOwner,
		selfId,
		isChangingAccess,
		refusal,
		onChangeAccess,
		onDelete
	}: {
		/** the workspaces this member holds a grant on, which is what the session carries. */
		workspaces: OrganizationWorkspace[];
		/** everybody in the organization, for the count on a card and the rows in the dialog. */
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
		/** whether the reader is the owner: a read-only credential is minted on their machine. */
		isOwner: boolean;
		/** the reader's own member id, which is not a row in the access dialog. */
		selfId: string;
		isChangingAccess: boolean;
		/**
		 * why there is no create control, for an owner whose machine lost the Turso authority;
		 * `null` for the owner who holds it and for everybody else, who is offered nothing and
		 * told nothing, since creating was never theirs to be refused.
		 */
		refusal: string | null;
		/** grant and withdraw what changed on a workspace's members; rejects the same way. */
		onChangeAccess: (
			workspaceId: string,
			changes: { memberId: string; access: AccessChoice }[]
		) => Promise<void>;
		/** delete a workspace and its database; rejects so the confirm stays open on the refusal. */
		onDelete: (workspaceId: string) => Promise<void>;
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

	/** the workspace each surface is open on, while it is. */
	let renaming = $state<OrganizationWorkspace | null>(null);
	let changingAccess = $state<OrganizationWorkspace | null>(null);
	let deleting = $state<OrganizationWorkspace | null>(null);

	const open = $derived(workspaces.find((workspace) => workspace.id === openWorkspaceId) ?? null);

	/**
	 * the workspace's edit, which is what activating its card opens.
	 *
	 * The two edits are gated separately, so what a workspace's edit *is* depends on who is
	 * looking: who holds it for somebody who may grant it, its name for somebody who may only
	 * rename the one they are in. A reader holding neither opens nothing, and the card still reads.
	 */
	const openEdit = (workspace: OrganizationWorkspace) => {
		if (canGrantWorkspace) {
			changingAccess = workspace;
		} else if (canRename && workspace.id === openWorkspaceId) {
			renaming = workspace;
		}
	};

	// the workspace the address names is opened and then cleared out of the address, the way the
	// members directory consumes an account: left there, a reload would reopen a surface the person
	// has already dismissed, and pressing the same card a second time would navigate nowhere.
	$effect(() => {
		const named = recordOf(page.url, WORKSPACE_PARAM);

		if (!named) return;

		const workspace = workspaces.find((candidate) => candidate.id === named);

		if (workspace) openEdit(workspace);

		void goto(sectionAddress, { replaceState: true, noScroll: true, keepFocus: true });
	});

	/** the rows the access dialog draws for a workspace: everybody who could hold it. */
	const accessRows = (workspace: OrganizationWorkspace) =>
		members
			.filter((member) => member.role !== 'owner' && member.id !== selfId)
			.map((member) => ({
				id: member.id,
				name: member.username,
				access: (member.workspaces.find((held) => held.id === workspace.id)?.access ??
					'none') as AccessChoice
			}));

	const changeAccess = async (changes: { id: string; access: AccessChoice }[]) => {
		if (!changingAccess) return;

		try {
			await onChangeAccess(
				changingAccess.id,
				changes.map((change) => ({ memberId: change.id, access: change.access }))
			);
			changingAccess = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen.
		}
	};

	/**
	 * what this reader may do to one workspace, in the order the card's menu offers it: its name,
	 * then who is in it, then losing it.
	 *
	 * Every gate is the one the acts carried before the cards, and an act the reader does not hold
	 * leaves no entry, so a card can come to offer nothing and the block then draws neither of its
	 * two routes.
	 *
	 * `attributes` is what the section is read by, here and in its test: the act and the workspace
	 * it acts on.
	 */
	const actsOn = (workspace: OrganizationWorkspace): RecordCardAction[] => [
		...(canRename && workspace.id === openWorkspaceId
			? [
					{
						label: $LL.workspace.rename(),
						icon: PencilIcon,
						attributes: { 'data-workspace-rename': workspace.id },
						onSelect: () => {
							renaming = workspace;
						}
					}
				]
			: []),
		...(canGrantWorkspace
			? [
					{
						// the directory's own word, read from the one key that holds it: who is in a
						// workspace is what this opens, and the dialog's own title says the rest.
						label: $LL.organization.dashboard.membersTitle(),
						icon: UsersIcon,
						attributes: { 'data-workspace-grant': workspace.id },
						onSelect: () => {
							changingAccess = workspace;
						}
					}
				]
			: []),
		...(canDelete
			? [
					{
						label: $LL.common.actions.delete(),
						icon: Trash2Icon,
						variant: 'destructive' as const,
						attributes: { 'data-workspace-delete': workspace.id },
						onSelect: () => {
							deleting = workspace;
						}
					}
				]
			: [])
	];
</script>

<!--
	the section's one primary, in the tray above the cards (requirement 21). Quiet and glyph-only
	with its words in a tooltip and on the control itself, which is how the contracts view and the
	members directory offer the same thing. The form that names a new workspace is the shared one
	mounted in the shell, and this is the control that opens it.
-->
{#snippet newWorkspace()}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon-sm"
					data-workspace-create
					aria-label={$LL.layout.workspaceMenu.create()}
					onclick={() => openOrganizationDialog('workspace')}
				>
					<PlusIcon />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			{$LL.layout.workspaceMenu.create()}
		</Tooltip.Content>
	</Tooltip.Root>
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
		action={canCreate ? newWorkspace : refusal ? authorityRefused : undefined}
	/>

	<div class="flex flex-col gap-3" data-workspaces>
		{#if workspaces.length === 0}
			<p class="text-sm text-muted-foreground">{$LL.organization.dashboard.noWorkspaces()}</p>
		{/if}

		{#each workspaces as workspace (workspace.id)}
			<!-- the card is the record and takes no mark of its own, so the workspace it stands for is
			     named on the element that holds it, which is what this section is read by. -->
			<div data-workspace={workspace.id}>
				<RecordCard
					href={addressOf(workspace.id)}
					label={workspace.name}
					actions={actsOn(workspace)}
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
													<CircleFilledIcon class="size-2" aria-hidden="true" />
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
									{workspace.name}
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

{#if open}
	<WorkspaceRenameForm
		workspace={open}
		open={renaming !== null}
		onOpenChange={(value) => {
			if (!value) renaming = null;
		}}
	/>
{/if}

<AccessDialog
	open={changingAccess !== null}
	onOpenChange={(value) => {
		if (!value && !isChangingAccess) changingAccess = null;
	}}
	title={$LL.organization.dashboard.workspaceAccessTitle()}
	description={$LL.organization.dashboard.workspaceAccessDescription({
		workspace: changingAccess?.name ?? ''
	})}
	rows={changingAccess ? accessRows(changingAccess) : []}
	canGrantReadOnly={isOwner}
	isSaving={isChangingAccess}
	onSave={(changes) => void changeAccess(changes)}
/>

<!-- the packaged confirm, which names what is lost before it offers anything destructive
     ([[rules/interface]], *Form surface*). Deleting a workspace deletes its database on Turso,
     and nothing anywhere puts it back. -->
<DeleteDialog
	open={deleting !== null}
	onOpenChange={(value) => {
		if (!value) deleting = null;
	}}
	onSubmit={async () => {
		if (deleting) await onDelete(deleting.id);
	}}
	record={deleting?.name ?? ''}
	title={$LL.organization.dashboard.deleteWorkspace()}
	description={$LL.organization.dashboard.deleteWorkspaceDescription()}
	confirmLabel={$LL.organization.dashboard.deleteWorkspace()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
