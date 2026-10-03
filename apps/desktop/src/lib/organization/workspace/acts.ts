import type { RecordAct } from '$lib/act';
import { accessIn, workspacePermissionsIn } from '$lib/api/context';
import type { OrganizationSession, OrganizationWorkspace } from '$lib/organization/host';
import { EXPORT_FLAGS, IMPORT_FLAGS, refusalOfEvery, type Standing } from '$lib/permission';
import { permits } from '@rentable/workspace-permission';
import FileDownIcon from '@lucide/svelte/icons/file-down';
import FileUpIcon from '@lucide/svelte/icons/file-up';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import UsersIcon from '@lucide/svelte/icons/users';

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
	/**
	 * where the reader stands in one workspace, by its id: what they may do there and how their
	 * grant reaches it, or `null` where that is not known yet. Read per workspace rather than off
	 * `memberPermissions`, which is the open workspace's, because a workspace's file is that
	 * workspace's records and the procedure asks the reader's flags there (effort 846,
	 * requirement 15).
	 */
	standingOf: (workspaceId: string) => Standing | null;
};

/**
 * where a reader stands in one workspace, read off their session the way the tRPC context folds it
 * for a call naming that workspace (`procedure.permittedIn`): their permissions with what is pinned
 * for them there, and their grant's access.
 */
export function standingIn(session: OrganizationSession, workspaceId: string): Standing {
	return {
		permissions: workspacePermissionsIn(session, workspaceId),
		accessLevel: accessIn(session, workspaceId)
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
	/** ask before deleting the workspace and its database. */
	confirmDelete: (record: WorkspaceActRecord) => void;
};

/** A workspace act, with the id narrowed to the ones declared here. */
export type WorkspaceAct = RecordAct<WorkspaceActRecord> & { id: WorkspaceActId };

/**
 * The workspace's acts, bound to the host: its name, then who is in it, then its file, then losing
 * it.
 */
export function declareWorkspaceActs(host: WorkspaceHostRequests): WorkspaceAct[] {
	return [
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
