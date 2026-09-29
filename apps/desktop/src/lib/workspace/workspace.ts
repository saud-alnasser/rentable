import type { OrganizationMember, OrganizationSession } from '$lib/organization/host';

/**
 * How long a workspace's name may be.
 *
 * **The organization store is the authority and this is a copy of its number**, which is worth stating
 * because a copy across a boundary is a thing that drifts. It is here so a name too long to store
 * is refused before a round trip rather than after one, and so the form can say so beside the
 * field the reader typed in. The service still decides what it stores; nothing here can make it
 * accept a name it would not.
 *
 * *The column itself has no length on it — `workspace.name` is SQLite `TEXT` — so what this bounds
 * is a name no surface can draw rather than one the row cannot hold.*
 */
export const WORKSPACE_NAME_LIMIT = 120;

/**
 * What the workspace's row at the top of the rail and its permissions in the frame need of the
 * organization, in the window, contributed by the organization, which depends on the workspace
 * rather than the other way round (`$lib/feature/feature`, under *What a feature contributes*).
 * Each is the organization's own query, handed over as the hook it is.
 */
export type WorkspaceSurfaceContributions = {
	/**
	 * where this machine stands: the session, whose permissions and workspaces the two read. The
	 * organization's state query, read in a component's script as it is created.
	 */
	useOrganizationState: () => {
		readonly data: { session: OrganizationSession | null } | undefined;
	};
	/** every member, read only while `enabled` says so: the rail counts who holds a workspace. */
	useMembers: (enabled: () => boolean) => { readonly data: OrganizationMember[] | undefined };
};
