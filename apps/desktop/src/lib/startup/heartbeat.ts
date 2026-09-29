import type { OrganizationState } from '$lib/organization';
import type { StartupMachine } from './machine';

/** what a sync manager reported, as this unit needs to read it. */
export type SyncOutcome = {
	action: string;
	received: boolean;
	/**
	 * the workspace the dispatch ran for, read before it ran; `null` where none was open.
	 *
	 * A dispatch in flight while a switch happens reports for the workspace that was open when it
	 * started, after the cache has been cleared for the one open now. Without this the report
	 * cannot be told from one about the new workspace, and a `received` outcome would run a
	 * reconcile the new workspace did not need and say rows arrived that a person never saw.
	 */
	workspaceId: string | null;
};

/**
 * what the member may do, as one comparable value: the session's permissions and the level of each
 * grant, which are what the record procedures answer by (`api/context.ts`). `null` signed out.
 */
function standingOf(organization: OrganizationState | null): string | null {
	const session = organization?.session;

	return session
		? JSON.stringify([
				session.permissions,
				session.workspaces.map((workspace) => [workspace.id, workspace.accessLevel])
			])
		: null;
}

/**
 * What a sync manager reported.
 *
 * Rows arriving from another device can make a status that was right before the pull wrong
 * after it, so a pull that landed rows reconciles. The guard is the day-crossing pass's, shared
 * rather than duplicated (`./reconcile`): both run a whole-table reconcile and two at once is one
 * of them wasted.
 *
 * **A report for a workspace other than the one open is dropped whole.** A dispatch in flight
 * while `switchWorkspace` ran reports for the workspace it started on, after the cache has
 * been cleared for the new one; applied, it would reconcile the new workspace for rows that
 * landed in the old one and announce them to a person who never saw them.
 */
export async function applySyncOutcome(machine: StartupMachine, outcome: SyncOutcome) {
	const state = await machine.ports.sync.getState().catch(() => null);
	const open = (state ?? machine.current.sync)?.workspace.remoteId ?? null;

	if (outcome.workspaceId !== open) {
		return;
	}

	await rereadOrganization(machine);

	if (state) {
		machine.set({ sync: state });
		machine.ports.cache.rememberRemoteSync(state);
	}

	await machine.ports.cache.invalidateRemoteSync();

	if (!outcome.received) {
		return;
	}

	await machine.reconciliation.received();
}

/**
 * What a heartbeat owes the organization (effort 838, requirement 8): a change to a role or an
 * override on another machine reaches an open session within one of them.
 *
 * **Every dispatch, not only one that brought workspace rows.** The dispatch pulls the
 * organization's replica as well, and `received` says nothing about it, so what the member may do
 * is read again each time: the held context is dropped, so the next call resolves the identity
 * off the verified row, and the state and every organization query are read again, so the
 * interface draws what the row now says. It costs one read of the state per heartbeat.
 *
 * A read that fails, or finds nobody in, leaves the snapshot as it was: a session ended from
 * another machine is the standing's to say, and it says it before this runs.
 *
 * **What the member may do changed, so is every record drawn.** A record query is read once and
 * held, and what it holds was answered for the permissions it was asked under: a kind no longer
 * viewable would go on showing where it is joined into another, and one viewable again would
 * go on missing. So a heartbeat that moves the permissions or a grant's level reads everything
 * again, as a workspace switch does, and one that moves nothing reads the organization alone.
 */
async function rereadOrganization(machine: StartupMachine) {
	machine.ports.cache.forgetContext();

	const before = standingOf(machine.current.organization);
	const organization = await machine.ports.organization.getState().catch(() => null);

	if (organization?.session) {
		machine.set({ organization });

		if (standingOf(organization) !== before) {
			await machine.ports.cache.invalidateAll();

			return;
		}
	}

	await machine.ports.cache.invalidateOrganization();
}
