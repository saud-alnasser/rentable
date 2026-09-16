<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type {
		MemberStanding,
		OrganizationMember,
		OrganizationWorkspace
	} from '$lib/platform/tauri';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import AccessDialog, {
		type AccessChoice
	} from '$lib/organization/component/access-dialog.svelte';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import RenameMemberDialog from '$lib/organization/component/rename-member-dialog.svelte';
	import RoleDialog from '$lib/organization/component/role-dialog.svelte';
	import TransferOwnership from '$lib/organization/component/transfer-ownership.svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import { RECORD_PARAM, recordOf, withSection } from '$lib/settings/section';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyIcon from '@lucide/svelte/icons/key-round';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import LinkIcon from '@lucide/svelte/icons/link';
	import LockIcon from '@lucide/svelte/icons/lock';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPenIcon from '@lucide/svelte/icons/user-pen';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * Everybody in the organization, as a directory of record cards.
	 *
	 * **One card per account, the way every other record here is shown** (effort 828, requirement
	 * 19). The shape is `complex/component/directory.svelte`'s over
	 * `design/block/record-card.svelte`: the card is the record, its own quiet control carries the
	 * acts, and the context gesture offers the same list ([[rules/interface]], *Record card
	 * actions*). *It was a list of rows with a hover cluster, and then rows with one visible
	 * control; the human saw the second in the running build and chose cards instead.*
	 *
	 * **A card says four things**: the username with the role beside it, one line of standing, and
	 * one line saying how many workspaces they hold. *Each workspace was a chip carrying its own
	 * access until the human's second look, which put a second list along the bottom of every
	 * card; which workspaces somebody holds, and what each one is good for, is what the menu's
	 * workspaces entry opens, and that surface lists every workspace with what they hold on it
	 * before it offers a change.*
	 *
	 * **The standing is the pair a link is gated on, read as a sentence.** An account holds no
	 * password until its first link is opened, and the register (requirement 15) says whether a
	 * machine is signed in on it. So the line that says *signed in on a machine* is also why the
	 * link act is not on that card, and no second sentence explains the absence.
	 *
	 * **Activating a card opens its record** ([[rules/interface]], *Row activation*). A member has
	 * no page, so what opening one means is this section drawing that account's edit, and the card's
	 * `href` is this section's address with the account named on it. The address is consumed on
	 * arrival and cleared, the way `complex/component/directory.svelte` consumes its create intent,
	 * so pressing the same card twice opens the same surface twice.
	 *
	 * **An act the session lacks is absent from the menu, not disabled.** Each gate is drawn from
	 * the reader's own permissions and refused again in Rust on the signed row.
	 *
	 * **Each act reads as one or two plain words**, and the sentence that explains it belongs to
	 * the surface it opens rather than to the entry: a menu is read at a glance, and *role and
	 * permissions* was a heading standing in for a verb.
	 *
	 * **The owner's account is removed by nobody and edited by nobody, and nobody edits their own
	 * role, permissions or workspaces** (requirement 19). So the owner's card carries one act and
	 * no other: handing the organization over (requirement 22), which is the owner's own and is
	 * absent for everybody else, so an administrator meets that card with no menu and no gesture at
	 * all. A reader's own card is the same: an account's name, role and workspaces
	 * are given by somebody else, and Rust refuses each of the three on the row of whoever is
	 * asking. *The owner's own card offered them their workspaces until the human's first look at
	 * this directory: an owner reaches every workspace anyway, so it was a control over a state
	 * that cannot be false.*
	 *
	 * **Removal has two speeds, and the ordinary one leads.** Removing stops renewing: the
	 * member's credential runs out within its lifetime and nobody else notices. Locking out rotates
	 * every workspace they held and stops everybody else in those workspaces until their
	 * application reconnects; it is the owner's, drawn under the remove, because it is chosen
	 * rather than fallen into. Both open the confirm the route raises, which reads the cost.
	 *
	 * **An account is made from the tray above the cards**, on the shared form surface
	 * ([[rules/interface]], *Form surface*). The tray is the contracts view's shape, which is what
	 * the human asked for on seeing this section: the section's name and sentence at one end of a
	 * bar, its one primary at the other, and the records below. *The primary sat under the last
	 * card until that look.*
	 *
	 * **The three light dialogs are mounted here once** and opened on whichever card named them:
	 * the role and its acts, the workspaces and their access, and the rename. The account form is
	 * not one of them: it is mounted in the shell beside the link the act produces, so that one
	 * panel shows the link wherever the account was made from.
	 */
	let {
		members,
		standings,
		workspaces,
		canInvite,
		canRemove,
		canLockOut,
		canRename,
		canReset,
		canChangeRole,
		canGrantWorkspace,
		isOwner,
		selfId,
		makingLink,
		unsetting,
		endingSessions,
		isChangingRole,
		isChangingAccess,
		isTransferring,
		transferRefusal,
		onEndSessions,
		onMakeLink,
		onUnsetPassword,
		onRemove,
		onLockOut,
		onRename,
		onChangeRole,
		onChangeAccess,
		onTransferOwnership
	}: {
		members: OrganizationMember[];
		/** where each account stands, joined to the members on the member's id. */
		standings: MemberStanding[];
		/** the workspaces the reader can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		/** whether the reader's row carries `inviteMember`: the add and the link. */
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
		/** the account a link is being made for, while it is. */
		makingLink: string | null;
		/** the account whose password is being unset, while it is. */
		unsetting: string | null;
		/** the member whose sessions are being ended, while they are. */
		endingSessions: string | null;
		isChangingRole: boolean;
		isChangingAccess: boolean;
		/** the transfer is running, which is a moment the owner is waiting on. */
		isTransferring: boolean;
		/** what the shell refused the last transfer with, marked on the surface's password. */
		transferRefusal: string | null;
		/**
		 * sign a member out of every machine. Their password is not changed by it, which is what
		 * makes it a different act from the reset beside it.
		 */
		onEndSessions: (memberId: string) => void;
		/**
		 * make the one link that admits a machine to the account (effort 828, requirement 20). The
		 * account's standing chooses its kind and the reader chooses nothing, so there is one act
		 * here where there were a copy link and a new link.
		 */
		onMakeLink: (memberId: string) => void;
		/** unset an account's password, so the next link made for it asks for a new one. */
		onUnsetPassword: (memberId: string) => void;
		/** ask to remove a member: the route raises the confirm that names what it costs. */
		onRemove: (memberId: string) => void;
		onLockOut: (memberId: string) => void;
		/** rename a member; rejects with what the shared handler has already said. */
		onRename: (memberId: string, username: string) => Promise<void>;
		/** write a member's role and permissions; rejects the same way. */
		onChangeRole: (
			memberId: string,
			role: 'administrator' | 'member',
			permissions: number
		) => Promise<void>;
		/** grant and withdraw what changed on a member's workspaces; rejects the same way. */
		onChangeAccess: (
			memberId: string,
			changes: { id: string; access: AccessChoice }[]
		) => Promise<void>;
		/**
		 * hand the organization to another account, with the owner's own password (requirement
		 * 22). It resolves when the two rows were written and rejects with what the shared handler
		 * has already said, which is what leaves the surface open on a wrong password.
		 */
		onTransferOwnership: (memberId: string, password: string) => Promise<void>;
	} = $props();

	// this section's own address, resolved once. A card's is it with the account named on it, which
	// is the whole of what a card's `href` is ([[rules/frontend]]: the path is the caller's to
	// resolve, and the packaged card takes one already resolved).
	const sectionAddress = resolve(withSection('members'));

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
	 * the one line a card carries about where an account stands, and the mark its test reads it by.
	 *
	 * `null` until the standings have been answered: the list of people is drawn either way, and a
	 * line guessed from nothing would say *no machine signed in* about an account somebody is
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
	 * whether a card is one this reader may write at all: never their own, and never the owner's.
	 *
	 * **The owner's account is removed by nobody and edited by nobody, and nobody edits their own
	 * role, permissions or workspaces** (requirement 19, corrected on the human's first look at
	 * this directory). So the owner's card is drawn with no menu whoever is reading it, until the
	 * transfer of ownership arrives beside it, and a reader's own card is nobody's to write either.
	 * Rust refuses every one of those on the signed row as well; this is the earlier refusal.
	 *
	 * *The owner's own card offered them their workspaces until that look: an owner reaches every
	 * workspace anyway and their own grant is never withdrawn, so what it offered was a control
	 * over a state that cannot be false.*
	 */
	const writable = (member: OrganizationMember) => member.id !== selfId && member.role !== 'owner';

	/**
	 * whether a link is offered for that account, by ticket 14's own gate: an account whose
	 * password is not set yet is offered one even while a machine is signed in, because nobody is
	 * signed in that the link would double, and an account with a password is offered one only
	 * while no machine is. Rust refuses the rest, and the standing line says why the act is absent.
	 *
	 * **An account with no standing yet offers no link**, which is the same reading `standingLine`
	 * makes of the same absence: the standings are still being answered, or the query failed, and
	 * an act drawn from nothing would be offered on a card whose own line says nothing, then
	 * refused by Rust on the gate this is standing in for.
	 */
	const linkable = (member: OrganizationMember) => {
		const standing = standingOf(member.id);

		return standing !== null && (!standing.passwordSet || !standing.machineSignedIn);
	};

	/**
	 * the accounts the organization could be handed to: everybody but the owner's own row.
	 *
	 * A removed account is not in this list either, because the members query does not answer one.
	 * Rust refuses both again on the signed row; this is the earlier refusal, and it is what keeps
	 * the surface from offering a choice that cannot go through.
	 */
	const transferable = $derived(
		members
			.filter((member) => member.role !== 'owner')
			.map((member) => ({ id: member.id, username: member.username }))
	);

	/** the member each dialog is open on, while it is. */
	let renaming = $state<OrganizationMember | null>(null);
	let transferring = $state(false);
	let changingRole = $state<OrganizationMember | null>(null);
	let changingAccess = $state<OrganizationMember | null>(null);
	let isRenaming = $state(false);

	/**
	 * the account's edit, which is what activating its card opens.
	 *
	 * **The fullest edit this reader holds, in the order the menu offers them.** The acts are
	 * separate because they are gated separately (effort 826, requirement 15), so what an account's
	 * edit *is* depends on who is looking: the role and its acts for somebody who may change them,
	 * the workspaces for somebody who may grant them, the name for somebody who may only correct a
	 * spelling. A reader holding none opens nothing, and the card still reads.
	 */
	const openEdit = (member: OrganizationMember) => {
		if (canChangeRole && writable(member)) {
			changingRole = member;
		} else if (canGrantWorkspace && writable(member)) {
			changingAccess = member;
		} else if (canRename && writable(member)) {
			renaming = member;
		}
	};

	// the account the address names is opened and then cleared out of the address, the way
	// `complex/component/directory.svelte` consumes a create intent: left there, a reload would
	// reopen a surface the person has already dismissed, and pressing the same card a second time
	// would navigate nowhere.
	$effect(() => {
		const named = recordOf(page.url);

		if (!named) return;

		const member = members.find((candidate) => candidate.id === named);

		if (member) openEdit(member);

		void goto(sectionAddress, { replaceState: true, noScroll: true, keepFocus: true });
	});

	const rename = async (username: string) => {
		if (!renaming) return;

		isRenaming = true;

		try {
			await onRename(renaming.id, username);
			renaming = null;
		} catch {
			// said by the shared handler. The surface stays open on what they typed, because the
			// refusals that reach here are the ones a person retries: a username somebody holds.
		} finally {
			isRenaming = false;
		}
	};

	const changeRole = async (role: 'administrator' | 'member', permissions: number) => {
		if (!changingRole) return;

		try {
			await onChangeRole(changingRole.id, role, permissions);
			changingRole = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen. The refusal that
			// reaches here is the owner's sentence on a signing act, which a person answers by
			// choosing something narrower rather than by starting again.
		}
	};

	const transfer = async (memberId: string, password: string) => {
		try {
			await onTransferOwnership(memberId, password);
			transferring = false;
		} catch {
			// said by the shared handler, and marked on the password by the surface, which stays
			// open with the account still chosen. The refusal that reaches here is a password that
			// did not open the owner's vault, which a person answers by typing it again.
		}
	};

	const changeAccess = async (changes: { id: string; access: AccessChoice }[]) => {
		if (!changingAccess) return;

		try {
			await onChangeAccess(changingAccess.id, changes);
			changingAccess = null;
		} catch {
			// said by the shared handler; the surface keeps what was chosen.
		}
	};

	/** the rows the access dialog draws for a member: every workspace, with what they hold on it. */
	const accessRows = (member: OrganizationMember) =>
		workspaces.map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			access: (member.workspaces.find((held) => held.id === workspace.id)?.access ??
				'none') as AccessChoice
		}));

	/**
	 * what this reader may do to one account, in the order the card's menu offers it: what they are
	 * called and what they may do, then their way in, then leaving.
	 *
	 * Every gate is the one the acts carried before the cards, and an act the reader does not hold
	 * leaves no entry, so a card can come to offer nothing and the block then draws neither of its
	 * two routes.
	 *
	 * `attributes` is what the section is read by, here and in its test: the act and the account it
	 * acts on.
	 */
	const actsOn = (member: OrganizationMember): RecordCardAction[] => [
		// the owner's own card, and the one act on it (requirement 22). It is the owner's alone and
		// on nobody else's card, so an administrator reading the owner's card still meets nothing.
		...(isOwner && member.id === selfId && member.role === 'owner' && transferable.length > 0
			? [
					{
						label: $LL.organization.dashboard.transferOwnership(),
						icon: CrownIcon,
						attributes: { 'data-member-transfer': member.id },
						disabled: isTransferring,
						onSelect: () => {
							transferring = true;
						}
					}
				]
			: []),
		...(canRename && writable(member)
			? [
					{
						label: $LL.organization.dashboard.rename(),
						icon: UserPenIcon,
						attributes: { 'data-member-rename': member.id },
						onSelect: () => {
							renaming = member;
						}
					}
				]
			: []),
		...(canChangeRole && writable(member)
			? [
					{
						label: $LL.organization.dashboard.changeRole(),
						icon: ShieldIcon,
						attributes: { 'data-member-role': member.id },
						onSelect: () => {
							changingRole = member;
						}
					}
				]
			: []),
		...(canGrantWorkspace && writable(member)
			? [
					{
						// the section's own word, read from the one key that holds it: the same thing
						// is called the same thing wherever a screen draws it (826, requirement 18).
						label: $LL.settings.section.workspaces(),
						icon: KeyIcon,
						attributes: { 'data-member-access': member.id },
						onSelect: () => {
							changingAccess = member;
						}
					}
				]
			: []),
		// the one link act (effort 828, requirement 20): what kind of link it is is read off the
		// account, and the standing that bars one is the line the card already carries.
		...(canInvite && writable(member) && linkable(member)
			? [
					{
						label: $LL.organization.dashboard.makeLink(),
						icon: LinkIcon,
						attributes: { 'data-member-link': member.id },
						disabled: makingLink !== null,
						onSelect: () => onMakeLink(member.id)
					}
				]
			: []),
		...(canReset && writable(member)
			? [
					{
						label: $LL.organization.dashboard.unsetPassword(),
						icon: RefreshCwIcon,
						attributes: { 'data-member-unset-password': member.id },
						disabled: unsetting !== null,
						onSelect: () => onUnsetPassword(member.id)
					},
					// beside the reset and behind the same act, because the two are the same trust
					// read twice: whoever may take somebody's way in away may close the ways in that
					// are already open (effort 826, requirement 22).
					{
						label: $LL.organization.dashboard.endSessions(),
						icon: LaptopIcon,
						attributes: { 'data-member-end-sessions': member.id },
						disabled: endingSessions !== null,
						onSelect: () => onEndSessions(member.id)
					}
				]
			: []),
		...(canRemove && writable(member)
			? [
					{
						label: $LL.organization.dashboard.remove(),
						icon: UserMinusIcon,
						variant: 'destructive' as const,
						attributes: { 'data-member-remove': member.id },
						onSelect: () => onRemove(member.id)
					}
				]
			: []),
		...(canRemove && canLockOut && writable(member)
			? [
					{
						label: $LL.organization.dashboard.lockOut(),
						icon: LockIcon,
						variant: 'destructive' as const,
						attributes: { 'data-member-lock-out': member.id },
						onSelect: () => onLockOut(member.id)
					}
				]
			: [])
	];
</script>

<!--
	the section's one primary, in the tray above the cards (requirement 19). Quiet and glyph-only
	with its words in a tooltip and on the control itself, which is how the contracts view offers
	the same thing: a directory is read before anything is added to it, so the control that adds is
	discoverable without competing with the records (*Semantics are secondary*, Refactoring UI
	p.60). The form is the shell's, opened the same way the rail's row opens it.
-->
{#snippet addAccount()}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon-sm"
					data-invite-open
					aria-label={$LL.organization.dashboard.addAccount()}
					onclick={() => openOrganizationDialog('account')}
				>
					<UserPlusIcon />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			{$LL.organization.dashboard.addAccount()}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<!-- the tray and its cards are one thing, so they sit at the list's own rhythm rather than at the
     fieldset's, which spaces one block of settings from the next. -->
<Field.Set class="gap-3" aria-labelledby="members-legend">
	<DirectoryTray
		legendId="members-legend"
		legend={$LL.settings.section.members()}
		description={$LL.organization.dashboard.membersDescription()}
		action={canInvite ? addAccount : undefined}
	/>

	<div class="flex flex-col gap-3" data-members>
		{#each members as member (member.id)}
			{@const standing = standingLine(member.id)}
			<!-- the card is the record and takes no mark of its own, so the account it stands for is
			     named on the element that holds it, which is what this section is read by. -->
			<div data-member={member.id}>
				<RecordCard
					href={addressOf(member.id)}
					label={member.username}
					actions={actsOn(member)}
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

<TransferOwnership
	open={transferring}
	onOpenChange={(open) => {
		if (!open && !isTransferring) transferring = false;
	}}
	accounts={transferable}
	{isTransferring}
	errorMessage={transferRefusal}
	onTransfer={(memberId, password) => void transfer(memberId, password)}
/>

<RenameMemberDialog
	open={renaming !== null}
	onOpenChange={(open) => {
		if (!open && !isRenaming) renaming = null;
	}}
	username={renaming?.username ?? ''}
	{isRenaming}
	onRename={(username) => void rename(username)}
/>

<RoleDialog
	open={changingRole !== null}
	onOpenChange={(open) => {
		if (!open && !isChangingRole) changingRole = null;
	}}
	username={changingRole?.username ?? ''}
	role={changingRole?.role ?? 'member'}
	permissions={changingRole?.permissions ?? 0}
	canGrantSigning={isOwner}
	isSaving={isChangingRole}
	onSave={(role, permissions) => void changeRole(role, permissions)}
/>

<AccessDialog
	open={changingAccess !== null}
	onOpenChange={(open) => {
		if (!open && !isChangingAccess) changingAccess = null;
	}}
	title={$LL.organization.dashboard.accessTitle()}
	description={$LL.organization.dashboard.accessDescription({
		username: changingAccess?.username ?? ''
	})}
	rows={changingAccess ? accessRows(changingAccess) : []}
	canGrantReadOnly={isOwner}
	isSaving={isChangingAccess}
	onSave={(changes) => void changeAccess(changes)}
/>
