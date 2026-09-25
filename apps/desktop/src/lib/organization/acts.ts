import type { RecordAct } from '$lib/design/acts';
import type {
	MemberStanding,
	OrganizationMember,
	OrganizationSession,
	OrganizationWorkspace
} from '$lib/platform/host';
import { permits, type RoleKind } from '@rentable/workspace-permission';
import CrownIcon from '@lucide/svelte/icons/crown';
import LaptopIcon from '@lucide/svelte/icons/laptop';
import LinkIcon from '@lucide/svelte/icons/link';
import LockIcon from '@lucide/svelte/icons/lock';
import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import UserMinusIcon from '@lucide/svelte/icons/user-minus';
import UsersIcon from '@lucide/svelte/icons/users';

/**
 * MEMBER AND WORKSPACE ACTS
 *
 * Everything a reader can do to one member and to one workspace from the settings directories, in
 * the order every surface offers it: the card's menu and its context menu, and the command menu.
 * Each of those is a projection of these lists (`design/acts.ts`), the way a contract's are, so
 * none of them can offer an act another does not, or offer it under another name.
 *
 * **What an act is gated on is the reader as much as the record.** A contract admits an act by its
 * own status; a member admits one by who is reading and what their row carries. So the record an
 * act is given is the member or the workspace with the facts its gates read beside it, and the
 * directory that draws the card is what puts them together. Every gate is the one the card carried
 * before these lists, and Rust refuses each act again on the signed row.
 *
 * **One verb per act** (effort 832, requirement 6): the member's name, role, widening and
 * workspaces are one edit, and the workspace's name is its edit. The glyph is the one every other
 * edit carries.
 */

/** who is reading the members directory, and what their row lets them do to somebody else's. */
export type MemberReader = {
	/** the reader's own member id, whose card offers nothing that writes it. */
	selfId: string;
	/** whether the reader is the owner: handing the organization over is theirs alone. */
	isOwner: boolean;
	/** `inviteMember`: the link, with `canReset`. */
	canInvite: boolean;
	/** `resetPassword`: the reset, ending sessions, and the link. */
	canReset: boolean;
	/** `removeMember`. */
	canRemove: boolean;
	/** the owner, which is who a lock-out is for. */
	canLockOut: boolean;
	/** `renameMember`. */
	canRename: boolean;
	/** `changeRole`. */
	canChangeRole: boolean;
	/** `grantWorkspace`. */
	canGrantWorkspace: boolean;
};

/** the member acts that run on the press and are waiting on the shell, while they are. */
export type MemberPending = {
	linking: boolean;
	unsetting: boolean;
	endingSessions: boolean;
	offering: boolean;
	withdrawing: boolean;
};

/** what the directory knows about the whole organization that a member act is gated on. */
export type MemberActContext = MemberReader & {
	/** whether an offer of the organization stands, with anybody: there is one at a time. */
	offerStands: boolean;
	/** the accounts the organization could be offered to. */
	offerable: { id: string; username: string }[];
	pending: MemberPending;
};

/** What a member act is given: the member, and the facts its gates read. */
export type MemberActRecord = { member: OrganizationMember; context: MemberActContext };

/**
 * who is reading, as the member acts are gated on it, read off the session.
 *
 * **The one place a reader's gates are read**, so the members directory and the command menu gate
 * an act on the same facts: a copy of these nine lines in each would be two answers to who may do
 * what, and the first permission added to one would leave the other offering an act the card does
 * not.
 */
export function memberReaderOf(session: OrganizationSession): MemberReader {
	const isOwner = session.role === 'owner';

	return {
		selfId: session.memberId,
		isOwner,
		canInvite: permits(session.permissions, 'inviteMember'),
		canReset: permits(session.permissions, 'resetPassword'),
		canRemove: permits(session.permissions, 'removeMember'),
		canLockOut: isOwner,
		canRename: permits(session.permissions, 'renameMember'),
		canChangeRole: permits(session.permissions, 'changeRole'),
		canGrantWorkspace: permits(session.permissions, 'grantWorkspace')
	};
}

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
function offerableOf(members: readonly OrganizationMember[], standings: readonly MemberStanding[]) {
	const passwordSet = (memberId: string) =>
		standings.find((standing) => standing.memberId === memberId)?.passwordSet === true;

	return members
		.filter((member) => member.role !== 'owner' && passwordSet(member.id))
		.map((member) => ({ id: member.id, username: member.username }));
}

/**
 * what every member act is gated on, for the whole organization at once: who is reading, what
 * their row carries, where the handover stands, and which writes are still running.
 */
export function toMemberActContext(
	reader: MemberReader,
	members: readonly OrganizationMember[],
	standings: readonly MemberStanding[],
	pending: MemberPending
): MemberActContext {
	return {
		...reader,
		offerStands: members.some((member) => member.offeredOwnership),
		offerable: offerableOf(members, standings),
		pending
	};
}

/** Every member act, by the id the palette keys it on. */
export type MemberActId =
	| 'member.withdrawOffer'
	| 'member.offerOwnership'
	| 'member.edit'
	| 'member.makeLink'
	| 'member.unsetPassword'
	| 'member.endSessions'
	| 'member.remove'
	| 'member.lockOut';

/**
 * What the member acts ask of the organization host. Each one opens something the host owns or
 * runs a write the host holds; none of them writes anything itself.
 */
export type MemberHostRequests = {
	/** open the member's one sheet: their name, role, widening and workspaces. */
	edit: (record: MemberActRecord) => void;
	/** open the handover, on the accounts it can go to. */
	offerOwnership: (record: MemberActRecord) => void;
	/** take the standing offer back. It asks nothing, because nothing is being unsealed. */
	withdrawOffer: (record: MemberActRecord) => void;
	/** make the one link that admits a machine to the member's row. */
	makeLink: (record: MemberActRecord) => void;
	/** unset the member's password, so the next link made for them asks for a new one. */
	unsetPassword: (record: MemberActRecord) => void;
	/** sign the member out of every machine. */
	endSessions: (record: MemberActRecord) => void;
	/** ask before removing the member, at either speed. */
	confirmRemoval: (record: MemberActRecord, lockOut: boolean) => void;
};

/** A member act, with the id narrowed to the ones declared here. */
export type MemberAct = RecordAct<MemberActRecord> & { id: MemberActId };

/**
 * whether a card is one this reader may write at all: never their own, and never the owner's.
 *
 * The owner is removed by nobody and edited by nobody, and nobody edits their own role,
 * permissions or workspaces (effort 828, requirement 19).
 */
const writable = ({ member, context }: MemberActRecord) =>
	member.id !== context.selfId && member.role !== 'owner';

/** whether this is the owner reading their own card, which is where the handover is. */
const ownersOwn = ({ member, context }: MemberActRecord) =>
	context.isOwner && member.id === context.selfId && member.role === 'owner';

/**
 * The member's acts, bound to the host that carries them out: what they are called and what they
 * may do, then their way in, then leaving.
 *
 * A function of the host rather than a constant beside it, as `declareContractActs` is, so the
 * list can be read and run without the host mounted.
 */
export function declareMemberActs(host: MemberHostRequests): MemberAct[] {
	return [
		{
			// the owner's own card, and the one act on it (requirement 22). While an offer stands the
			// act is withdrawing it, in the offer's place: there is one offer at a time.
			id: 'member.withdrawOffer',
			label: (t) => t.organization.dashboard.withdrawOffer(),
			icon: CrownIcon,
			group: 'primary',
			appliesTo: (record) => ownersOwn(record) && record.context.offerStands,
			unavailable: (record, t) =>
				record.context.pending.withdrawing ? t.common.actions.working() : undefined,
			run: host.withdrawOffer
		},
		{
			id: 'member.offerOwnership',
			label: (t) => t.organization.dashboard.transferOwnership(),
			icon: CrownIcon,
			group: 'primary',
			appliesTo: (record) =>
				ownersOwn(record) && !record.context.offerStands && record.context.offerable.length > 0,
			unavailable: (record, t) =>
				record.context.pending.offering ? t.common.actions.working() : undefined,
			run: host.offerOwnership
		},
		{
			// one edit where the name, the role and the workspaces were two entries: they are one
			// person's standing, and the sheet draws whichever of them this reader may write.
			id: 'member.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			appliesTo: (record) =>
				writable(record) &&
				(record.context.canRename ||
					record.context.canChangeRole ||
					record.context.canGrantWorkspace),
			run: host.edit
		},
		{
			// the one link act (effort 828, requirement 20), offered to a holder of either act, as
			// `invite::make_link` and the router admit either. No standing bars one.
			id: 'member.makeLink',
			label: (t) => t.organization.dashboard.makeLink(),
			icon: LinkIcon,
			group: 'lifecycle',
			appliesTo: (record) =>
				(record.context.canInvite || record.context.canReset) && writable(record),
			unavailable: (record, t) =>
				record.context.pending.linking ? t.common.actions.working() : undefined,
			run: host.makeLink
		},
		{
			id: 'member.unsetPassword',
			label: (t) => t.organization.dashboard.unsetPassword(),
			icon: RefreshCwIcon,
			group: 'lifecycle',
			appliesTo: (record) => record.context.canReset && writable(record),
			unavailable: (record, t) =>
				record.context.pending.unsetting ? t.common.actions.working() : undefined,
			run: host.unsetPassword
		},
		{
			// beside the reset and behind the same act: whoever may take somebody's way in away may
			// close the ways in that are already open (effort 826, requirement 22).
			id: 'member.endSessions',
			label: (t) => t.organization.dashboard.endSessions(),
			icon: LaptopIcon,
			group: 'lifecycle',
			appliesTo: (record) => record.context.canReset && writable(record),
			unavailable: (record, t) =>
				record.context.pending.endingSessions ? t.common.actions.working() : undefined,
			run: host.endSessions
		},
		{
			id: 'member.remove',
			label: (t) => t.organization.dashboard.remove(),
			icon: UserMinusIcon,
			tone: 'error',
			group: 'destructive',
			confirmation: 'irreversible',
			appliesTo: (record) => record.context.canRemove && writable(record),
			run: (record) => host.confirmRemoval(record, false)
		},
		{
			// the owner's, under the remove, because it is chosen rather than fallen into.
			id: 'member.lockOut',
			label: (t) => t.organization.dashboard.lockOut(),
			icon: LockIcon,
			tone: 'error',
			group: 'destructive',
			confirmation: 'irreversible',
			appliesTo: (record) =>
				record.context.canRemove && record.context.canLockOut && writable(record),
			run: (record) => host.confirmRemoval(record, true)
		}
	];
}

/** what the workspaces directory knows that a workspace act is gated on. */
export type WorkspaceActContext = {
	/** the workspace open on this machine, which is the only one that can be renamed. */
	openWorkspaceId: string | null;
	/** `renameWorkspace`. */
	canRename: boolean;
	/** `grantWorkspace`. */
	canGrantWorkspace: boolean;
	/** the owner, refused again in Rust (`require_owner`). */
	canDelete: boolean;
};

/**
 * what the workspace acts are gated on, read off the session and the workspace open on this
 * machine. The one place they are read, for the reason {@link memberReaderOf} gives.
 */
export function workspaceContextOf(
	session: OrganizationSession,
	openWorkspaceId: string | null
): WorkspaceActContext {
	return {
		openWorkspaceId,
		canRename: permits(session.permissions, 'renameWorkspace'),
		canGrantWorkspace: permits(session.permissions, 'grantWorkspace'),
		canDelete: session.role === 'owner'
	};
}

/** What a workspace act is given: the workspace, and the facts its gates read. */
export type WorkspaceActRecord = { workspace: OrganizationWorkspace; context: WorkspaceActContext };

/** Every workspace act, by the id the palette keys it on. */
export type WorkspaceActId = 'workspace.edit' | 'workspace.members' | 'workspace.delete';

/** What the workspace acts ask of the organization host. */
export type WorkspaceHostRequests = {
	/** open the workspace's name. */
	edit: (record: WorkspaceActRecord) => void;
	/** open who holds the workspace, and at what. */
	changeAccess: (record: WorkspaceActRecord) => void;
	/** ask before deleting the workspace and its database. */
	confirmDelete: (record: WorkspaceActRecord) => void;
};

/** A workspace act, with the id narrowed to the ones declared here. */
export type WorkspaceAct = RecordAct<WorkspaceActRecord> & { id: WorkspaceActId };

/** The workspace's acts, bound to the host: its name, then who is in it, then losing it. */
export function declareWorkspaceActs(host: WorkspaceHostRequests): WorkspaceAct[] {
	return [
		{
			// the open workspace's alone: `remoteSync.rename` renames this machine's workspace, and
			// no command renames one from a distance.
			id: 'workspace.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			appliesTo: ({ workspace, context }) =>
				context.canRename && workspace.id === context.openWorkspaceId,
			run: host.edit
		},
		{
			// the directory's own word: who is in a workspace is what this opens.
			id: 'workspace.members',
			label: (t) => t.organization.dashboard.membersTitle(),
			icon: UsersIcon,
			group: 'primary',
			appliesTo: ({ context }) => context.canGrantWorkspace,
			run: host.changeAccess
		},
		{
			id: 'workspace.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			confirmation: 'irreversible',
			appliesTo: ({ context }) => context.canDelete,
			run: host.confirmDelete
		}
	];
}

/**
 * The word the member forms still pick for the role a member holds: `administrator` for the
 * manager's role, `member` for anything else.
 *
 * **A bridge.** What crosses from the shell is the role's kind since ticket 08 of effort 838; the
 * member sheet and the account form still offer the two words, and `platform/tauri` turns the one
 * picked back into a role id. Ticket 11 gives both a role picker, and this goes with the word.
 */
export const formRoleOf = (kind: RoleKind): 'administrator' | 'member' =>
	kind === 'manager' ? 'administrator' : 'member';
