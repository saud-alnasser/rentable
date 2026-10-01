import type { OrganizationSession } from '$lib/organization';

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
};
