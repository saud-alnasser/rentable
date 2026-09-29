import type { RecordAct } from '$lib/act';
import type { OrganizationSession, OrganizationWorkspace } from '$lib/organization/host';
import { permits } from '@rentable/workspace-permission';
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
};

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
