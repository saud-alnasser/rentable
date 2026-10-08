import type { RecordAct } from '$lib/act';
import { accessIn, workspacePermissionsIn } from '$lib/api/context';
import type { OrganizationSession, OrganizationWorkspace } from '$lib/organization/host';
import { EXPORT_FLAGS, IMPORT_FLAGS, refusalOfEvery, type Standing } from '$lib/permission';
import { permits } from '@rentable/workspace-permission';
import DatabaseArrowUpIcon from '@lucide/svelte/icons/database-arrow-up';
import FileDownIcon from '@lucide/svelte/icons/file-down';
import FileUpIcon from '@lucide/svelte/icons/file-up';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import UserMinusIcon from '@lucide/svelte/icons/user-minus';
import UsersIcon from '@lucide/svelte/icons/users';

import type { MemberActRecord } from '../member/acts';
import { refusedWhileLocked } from '../locked';
import { lacking } from '../role/acts';

/**
 * WORKSPACE ACTS
 *
 * Everything a reader can do to one workspace from the workspaces directory, on the terms
 * `../member/acts.ts` gives for the member's.
 */

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
	/** whether the reader is locked, which refuses every act that writes first (effort 851). */
	locked: boolean;
	/**
	 * where the reader stands in one workspace, by its id: what they may do there and how their
	 * grant reaches it, or `null` where that is not known yet. Read per workspace rather than off
	 * `memberPermissions`, which is the open workspace's, because a workspace's file is that
	 * workspace's records and the procedure asks the reader's flags there (effort 846,
	 * requirement 15).
	 */
	standingOf: (workspaceId: string) => Standing | null;
	/**
	 * whether a workspace has an upgrade waiting that the reader may run, by its id (effort 857,
	 * ticket 08): what waits there and the reader's `upgradeData`, read by the section that has
	 * them. Nothing is upgradable where it is not said.
	 */
	upgradable?: (workspaceId: string) => boolean;
};

/**
 * where a reader stands in one workspace, read off their session the way the tRPC context folds it
 * for a call naming that workspace (`procedure.permittedIn`): their permissions with what is pinned
 * for them there, and their grant's access.
 */
export function standingIn(session: OrganizationSession, workspaceId: string): Standing {
	return {
		permissions: workspacePermissionsIn(session, workspaceId),
		accessLevel: accessIn(session, workspaceId),
		locked: session.locked
	};
}

/**
 * what the workspace acts are gated on, read off the session and the workspace open on this
 * machine. The one place they are read, for the reason `memberReaderOf` in `../member/acts.ts`
 * gives.
 */
export function workspaceContextOf(
	session: OrganizationSession,
	openWorkspaceId: string | null
): WorkspaceActContext {
	return {
		openWorkspaceId,
		canRename: permits(session.permissions, 'renameWorkspace'),
		canGrantWorkspace: permits(session.permissions, 'grantWorkspace'),
		canDelete: session.role === 'owner',
		locked: session.locked,
		standingOf: (workspaceId) => standingIn(session, workspaceId)
	};
}

/** What a workspace act is given: the workspace, and the facts its gates read. */
export type WorkspaceActRecord = { workspace: OrganizationWorkspace; context: WorkspaceActContext };

/** Every workspace act, by the id the palette keys it on. */
export type WorkspaceActId =
	| 'workspace.edit'
	| 'workspace.members'
	| 'workspace.export'
	| 'workspace.import'
	| 'workspace.upgrade'
	| 'workspace.delete';

/** What the workspace acts ask of the organization host. */
export type WorkspaceHostRequests = {
	/** open the workspace's name. */
	edit: (record: WorkspaceActRecord) => void;
	/** open the workspace's page, where who holds it is changed. */
	changeAccess: (record: WorkspaceActRecord) => void;
	/** write the workspace's records to a file the reader chooses. */
	exportFile: (record: WorkspaceActRecord) => void;
	/** read a file into the workspace, once the reader has seen what it would do. */
	importFile: (record: WorkspaceActRecord) => void;
	/** open the upgrade sheet on the workspace: what it changes and whom it stops. */
	upgrade: (record: WorkspaceActRecord) => void;
	/** ask before deleting the workspace and its database. */
	confirmDelete: (record: WorkspaceActRecord) => void;
};

/** A workspace act, with the id narrowed to the ones declared here. */
export type WorkspaceAct = RecordAct<WorkspaceActRecord> & { id: WorkspaceActId };

/**
 * The workspace's acts, bound to the host: its name, then who is in it, then its file, then its
 * upgrade where one waits that the reader may run, then losing it.
 */
export function declareWorkspaceActs(host: WorkspaceHostRequests): WorkspaceAct[] {
	const acts: WorkspaceAct[] = [
		{
			// the open workspace's alone: `sync.rename` renames this machine's workspace, and
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
			// the directory's own word: who is in a workspace is what this opens. Offered to every
			// reader and refused, naming the flag, without it, as the member's card draws its
			// workspaces for every reader and refuses them the same way: the two ends of a grant.
			id: 'workspace.members',
			label: (t) => t.organization.dashboard.membersTitle(),
			icon: UsersIcon,
			group: 'primary',
			unavailable: ({ context }, t) =>
				context.canGrantWorkspace ? undefined : lacking(t, 'grantWorkspace'),
			run: host.changeAccess
		},
		{
			// a workspace's file moves from its own card, whether or not it is open here (effort
			// 846, requirement 15): the open one through this machine's replica, any other over
			// Turso. Offered on every card and refused, naming the first view flag the reader lacks
			// in that workspace, since the file holds every kind. Offline cannot be known before
			// the press, so a workspace that is not open is refused by the procedure, with its
			// sentence, rather than here.
			id: 'workspace.export',
			label: (t) => t.common.actions.export(),
			icon: FileDownIcon,
			group: 'primary',
			unavailable: ({ workspace, context }, t) =>
				refusalOfEvery(EXPORT_FLAGS, context.standingOf(workspace.id), t),
			run: host.exportFile
		},
		{
			// every kind's create in that workspace, as `transfer.importWhole` asks there; a
			// read-only grant on it is the reason, whatever the role says.
			id: 'workspace.import',
			label: (t) => t.common.actions.import(),
			icon: FileUpIcon,
			group: 'primary',
			unavailable: ({ workspace, context }, t) =>
				refusalOfEvery(IMPORT_FLAGS, context.standingOf(workspace.id), t),
			run: host.importFile
		},
		{
			// offered only where an upgrade waits and the reader may run it, which is also where the
			// card carries its mark (effort 857, ticket 08); nobody else is offered it, since it is
			// not theirs to be refused.
			id: 'workspace.upgrade',
			label: (t) => t.organization.upgrade.act(),
			icon: DatabaseArrowUpIcon,
			group: 'primary',
			appliesTo: ({ workspace, context }) => context.upgradable?.(workspace.id) === true,
			run: host.upgrade
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

	// a locked reader meets every act their row carries, refused for the lock, save the two that
	// read (effort 851, requirement 32): the export, and who is in the workspace, which only opens
	// its page, where every act on a holder is refused for the lock in turn.
	return refusedWhileLocked<WorkspaceActRecord, WorkspaceAct>(
		acts,
		({ context }) => context.locked,
		['workspace.export', 'workspace.members']
	);
}

/**
 * One member in a workspace, as a card on the workspace's page offers acts on them there (effort
 * 846, tickets 50 and 51): the member with the reader's gates, as their own card reads them, and
 * the workspace the card stands on.
 */
export type HolderActRecord = {
	holder: MemberActRecord;
	workspace: OrganizationWorkspace;
	/** whether a write on this page is running, which every act waits for. */
	writing: boolean;
};

/** Every act on a member in a workspace, by the id the card's menu keys it on. */
export type HolderActId = 'holder.permissions' | 'holder.remove';

/** What the acts on a member in a workspace ask of the organization host. */
export type HolderHostRequests = {
	/** open the sheet of what the member may do in this workspace alone. */
	editPermissions: (record: HolderActRecord) => void;
	/** ask before taking the workspace back from the member. */
	confirmRemove: (record: HolderActRecord) => void;
};

/** An act on a member in a workspace, with the id narrowed to the ones declared here. */
export type HolderAct = RecordAct<HolderActRecord> & { id: HolderActId };

/**
 * The acts on one member from a workspace's page, bound to the host: what they may do here, then
 * taking the workspace back from them. Pressing the card runs the first (ticket 51, at the human's
 * word of 2026-10-03: "a card when clicked it opens the edit permissions option sheet; and the
 * eliapess show edit permissions and remove options only"). *The menu also held open member,
 * their card in the members section, and the permissions were tailor access here, opening that
 * card on this workspace, until then.*
 *
 * **Each is refused as the router and Rust would refuse it**, said at the entry: the permissions
 * are `overrideMember`'s, and a member ranked at or above the reader is tailored by somebody above
 * them, as their own card's edit says; the removal is a withdrawal, `grantWorkspace`'s, which a
 * reader holding the workspace read only may still make.
 */
export function declareHolderActs(host: HolderHostRequests): HolderAct[] {
	const acts: HolderAct[] = [
		{
			id: 'holder.permissions',
			label: (t) => t.organization.workspacePage.editPermissions(),
			icon: SlidersHorizontalIcon,
			group: 'primary',
			unavailable: ({ holder }, t) =>
				!holder.context.canOverride
					? lacking(t, 'overrideMember')
					: holder.member.rank >= holder.context.rank
						? t.organization.dashboard.notBelowYou()
						: undefined,
			run: host.editPermissions
		},
		{
			// it ends their access here, so it is drawn as ending something and asks first; adding
			// them again gives it back.
			id: 'holder.remove',
			label: (t) => t.organization.workspacePage.removeFromWorkspace(),
			icon: UserMinusIcon,
			tone: 'error',
			group: 'destructive',
			confirmation: 'reversible',
			unavailable: ({ holder, writing }, t) =>
				!holder.context.canGrantWorkspace
					? lacking(t, 'grantWorkspace')
					: writing
						? t.common.actions.working()
						: undefined,
			run: host.confirmRemove
		}
	];

	// both write, so a locked reader meets them refused for the lock (effort 851).
	return refusedWhileLocked<HolderActRecord, HolderAct>(
		acts,
		({ holder }) => holder.context.locked
	);
}
