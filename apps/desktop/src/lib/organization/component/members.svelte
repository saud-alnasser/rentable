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
	import { toErrorText } from '$lib/error/message';
	import type { AccessChoice } from '$lib/organization/component/access-dialog.svelte';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import MemberSheet, { type MemberEdit } from '$lib/organization/component/member-sheet.svelte';
	import RenameMemberDialog from '$lib/organization/component/rename-member-dialog.svelte';
	import RoleTable from '$lib/organization/component/role-table.svelte';
	import OfferOwnership from '$lib/organization/component/offer-ownership.svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import { RECORD_PARAM, recordOf, withSection } from '$lib/settings/section';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import LockIcon from '@lucide/svelte/icons/lock';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPenIcon from '@lucide/svelte/icons/user-pen';
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
	 * no page, so what opening one means is this section drawing that member's sheet, and the card's
	 * `href` is this section's address with the member named on it. The address is consumed on
	 * arrival and cleared, the way `complex/component/directory.svelte` consumes its create intent,
	 * so pressing the same card twice opens the same surface twice. The rule records this as its
	 * accepted deviation, dated 2026-09-17: in the settings directories a record's page is its sheet.
	 *
	 * **What a card opens is one sheet rather than two dialogs** (requirement 23). A member's role,
	 * what they are also allowed beyond it, and the workspaces they hold are one person's standing,
	 * and they were split across two entries of one menu. The menu carries `edit` where it carried
	 * a role and a workspaces entry, and the card's address and that entry open the same sheet.
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
	 * offer stands, and withdrawing the one that does. A handover is two acts on two machines, so
	 * between them there is a standing offer the owner can see and undo, and the card is where
	 * they see it. A reader's own card is the same: a member's name, role and workspaces
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
	 * **A member is made from the tray above the cards**, on the shared form surface
	 * ([[rules/interface]], *Form surface*). The tray is the contracts view's shape, which is what
	 * the human asked for on seeing this section: the section's name and sentence at one end of a
	 * bar, its one primary at the other, and the records below. *The primary sat under the last
	 * card until that look.*
	 *
	 * **What each role may do is read from the tray too**, beside the add and as quiet as it
	 * (requirement 23). The comparison is documentation rather than a control, so it sits next to
	 * the directory rather than inside the chooser that picks a role.
	 *
	 * **The two light surfaces are mounted here once** and opened on whichever card named them:
	 * the member's sheet, and the rename. The form that makes a member is not one of them: it is
	 * mounted in the shell beside the link the act produces, so that one panel shows the link
	 * wherever the member was made from.
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
		isOffering,
		isWithdrawing,
		offerRefusal,
		onEndSessions,
		onMakeLink,
		onUnsetPassword,
		onRemove,
		onLockOut,
		onRename,
		onChangeRole,
		onChangeAccess,
		onOfferOwnership,
		onWithdrawOffer
	}: {
		members: OrganizationMember[];
		/** where each member stands, joined to the members on the member's id. */
		standings: MemberStanding[];
		/** the workspaces the reader can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
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
		/** the member a link is being made for, while it is. */
		makingLink: string | null;
		/** the member whose password is being unset, while it is. */
		unsetting: string | null;
		/** the member whose sessions are being ended, while they are. */
		endingSessions: string | null;
		isChangingRole: boolean;
		isChangingAccess: boolean;
		/** the offer is being written, which is a moment the owner is waiting on. */
		isOffering: boolean;
		/** the offer is being taken back, which is another. */
		isWithdrawing: boolean;
		/** what the shell refused the last offer with, marked on the surface's password. */
		offerRefusal: string | null;
		/**
		 * sign a member out of every machine. Their password is not changed by it, which is what
		 * makes it a different act from the reset beside it.
		 */
		onEndSessions: (memberId: string) => void;
		/**
		 * make the one link that admits a machine to the member's row (effort 828, requirement 20).
		 * Their standing chooses its kind and the reader chooses nothing, so there is one act
		 * here where there were a copy link and a new link.
		 */
		onMakeLink: (memberId: string) => void;
		/** unset a member's password, so the next link made for them asks for a new one. */
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
		 * offer the organization to another member, with the owner's own password (requirement
		 * 22). It resolves when the offer was written and rejects with what the shared handler has
		 * already said, which is what leaves the surface open on a wrong password.
		 */
		onOfferOwnership: (memberId: string, password: string) => Promise<void>;
		/** take the offer back. It asks for nothing, because nothing is being unsealed. */
		onWithdrawOffer: () => void;
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
	 * whether a card is one this reader may write at all: never their own, and never the owner's.
	 *
	 * **The owner is removed by nobody and edited by nobody, and nobody edits their own
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
	 * whether this reader may make a link at all: either act, the way Rust and the router gate
	 * it. *It was `canInvite` alone until review round two of effort 828, after the human had
	 * widened the act to `resetPassword` at round one and the card was the one gate not
	 * widened.*
	 */
	const canLink = $derived(canInvite || canReset);

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

	/** the member an offer stands with, or `null`. One card carries it or none does. */
	const offered = $derived(members.find((member) => member.offeredOwnership) ?? null);

	/** the member each surface is open on, while it is. */
	let renaming = $state<OrganizationMember | null>(null);
	let offering = $state(false);
	let editing = $state<OrganizationMember | null>(null);
	let isRenaming = $state(false);
	let readingRoles = $state(false);

	/** what the role act refused the last save with, marked on the section that asked for it. */
	let roleRefusal = $state<string | null>(null);
	/** what the grants refused it with, marked on the workspaces. */
	let workspacesRefusal = $state<string | null>(null);

	/**
	 * the member's edit, which is what activating their card opens.
	 *
	 * **One sheet holds the role, the widening and the workspaces** (requirement 23), and what it
	 * draws is what this reader may write: the acts are gated separately (effort 826, requirement
	 * 15), so a reader holding `grantWorkspace` alone meets the workspaces and nothing else. The
	 * name is still its own surface, because renaming is what a reader holding neither of the two
	 * may do, and the card still reads for a reader holding none of the three.
	 */
	const openEdit = (member: OrganizationMember) => {
		if (!writable(member)) return;

		if (canChangeRole || canGrantWorkspace) {
			roleRefusal = null;
			workspacesRefusal = null;
			editing = member;
		} else if (canRename) {
			renaming = member;
		}
	};

	// the member the address names is opened and then cleared out of the address, the way
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

	/**
	 * one save, and the acts that exist behind it.
	 *
	 * **Each act is asked for only where something changed**, and each refuses on its own: the role
	 * act writes the role and the column together, the grants write one workspace each. So a save
	 * that changed both and was refused one of them leaves the other written, which is what the
	 * two acts do on their own and what the sentence on the section then says.
	 *
	 * **A refusal keeps the sheet open and marks its section** ([[rules/interface]], *Validation
	 * errors*), rather than reaching the reader as a toast over a surface that has already closed.
	 * The shared handler still says it too; this is the copy the field carries.
	 */
	const save = async (member: OrganizationMember, edit: MemberEdit) => {
		roleRefusal = null;
		workspacesRefusal = null;

		if (edit.role !== member.role || edit.permissions !== member.permissions) {
			try {
				await onChangeRole(member.id, edit.role, edit.permissions);
			} catch (error) {
				roleRefusal = toErrorText(error, $LL);
			}
		}

		if (edit.changes.length > 0) {
			try {
				await onChangeAccess(member.id, edit.changes);
			} catch (error) {
				workspacesRefusal = toErrorText(error, $LL);
			}
		}

		if (!roleRefusal && !workspacesRefusal) editing = null;
	};

	const offer = async (memberId: string, password: string) => {
		try {
			await onOfferOwnership(memberId, password);
			offering = false;
		} catch {
			// said by the shared handler, and marked on the password by the surface, which stays
			// open with the member still chosen. The refusal that reaches here is a password that
			// did not open the owner's vault, which a person answers by typing it again.
		}
	};

	/** the rows the sheet's workspaces draw: every workspace, with what this member holds on it. */
	const accessRows = (member: OrganizationMember) =>
		workspaces.map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			access: (member.workspaces.find((held) => held.id === workspace.id)?.access ??
				'none') as AccessChoice
		}));

	/**
	 * what this reader may do to one member, in the order the card's menu offers it: what they are
	 * called and what they may do, then their way in, then leaving.
	 *
	 * Every gate is the one the acts carried before the cards, and an act the reader does not hold
	 * leaves no entry, so a card can come to offer nothing and the block then draws neither of its
	 * two routes.
	 *
	 * `attributes` is what the section is read by, here and in its test: the act and the member it
	 * acts on.
	 */
	const actsOn = (member: OrganizationMember): RecordCardAction[] => [
		// the owner's own card, and the one act on it (requirement 22). It is the owner's alone and
		// on nobody else's card, so an administrator reading the owner's card still meets nothing.
		// While an offer stands the act is withdrawing it, in the offer's place: there is one
		// offer at a time, so a card carrying both would be offering something Rust refuses.
		...(isOwner && member.id === selfId && member.role === 'owner' && offered
			? [
					{
						label: $LL.organization.dashboard.withdrawOffer(),
						icon: CrownIcon,
						attributes: { 'data-member-withdraw-offer': member.id },
						disabled: isWithdrawing,
						onSelect: onWithdrawOffer
					}
				]
			: []),
		...(isOwner &&
		member.id === selfId &&
		member.role === 'owner' &&
		!offered &&
		offerable.length > 0
			? [
					{
						label: $LL.organization.dashboard.transferOwnership(),
						icon: CrownIcon,
						attributes: { 'data-member-transfer': member.id },
						disabled: isOffering,
						onSelect: () => {
							offering = true;
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
		// one entry where the role and the workspaces were two (requirement 23): they are one
		// person's standing, and the surface it opens draws whichever of them this reader may
		// write. The word is the shared one, so the entry reads as every other edit here does.
		...((canChangeRole || canGrantWorkspace) && writable(member)
			? [
					{
						label: $LL.common.actions.edit(),
						icon: UserCogIcon,
						attributes: { 'data-member-edit': member.id },
						onSelect: () => openEdit(member)
					}
				]
			: []),
		// the one link act (effort 828, requirement 20): what kind of link it is is read off the
		// member, and no standing bars one. *The card offered it only where the standing allowed
		// it until the human ruled one machine per account out on 2026-09-20.*
		...(canLink && writable(member)
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
		action={trayActions}
	/>

	<div class="flex flex-col gap-3" data-members>
		{#each members as member (member.id)}
			{@const standing = standingLine(member.id)}
			<!-- the card is the record and takes no mark of its own, so the member it stands for is
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

<OfferOwnership
	open={offering}
	onOpenChange={(open) => {
		if (!open && !isOffering) offering = false;
	}}
	accounts={offerable}
	{isOffering}
	errorMessage={offerRefusal}
	onOffer={(memberId, password) => void offer(memberId, password)}
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

<MemberSheet
	open={editing !== null}
	onOpenChange={(open) => {
		if (!open && !isChangingRole && !isChangingAccess) editing = null;
	}}
	username={editing?.username ?? ''}
	role={editing?.role ?? 'member'}
	permissions={editing?.permissions ?? 0}
	rows={editing ? accessRows(editing) : []}
	{canChangeRole}
	{canGrantWorkspace}
	canGrantSigning={isOwner}
	canGrantReadOnly={isOwner}
	isSaving={isChangingRole || isChangingAccess}
	{roleRefusal}
	{workspacesRefusal}
	onSave={(edit) => {
		if (editing) void save(editing, edit);
	}}
/>

<RoleTable
	open={readingRoles}
	onOpenChange={(open) => {
		readingRoles = open;
	}}
/>
