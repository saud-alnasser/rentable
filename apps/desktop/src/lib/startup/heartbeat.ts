import type { HeldByVersion, OrganizationState } from '$lib/organization';
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
	/**
	 * what holds this machine by its version after the dispatch, as the shell judged it after the
	 * organization's pull and before anything went out, the organization's verdict and the open
	 * workspace's apart, or empty where this build may write everything it has open (effort 857,
	 * requirement 9, ticket 16). *Not the session's standing*, which a dispatch that ended the
	 * session has already acted on before reporting.
	 */
	heldByVersion: HeldByVersion[];
	/**
	 * why the shell refused a dispatch that threw, as the refusal's code, or `null` where it
	 * carried none: what lets a refusal for the version be routed rather than read as text.
	 */
	refusal?: string | null;
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
 *
 * **A pull that brought a newer rentable's upgrade moves the application first** (effort 857,
 * requirement 9), before anything else is written, the reconcile after the pull included. Below a
 * read floor the person goes where ticket 11's routing puts a way in the version refused: the
 * switcher with the reason against the organization, or the update-required screen in place of
 * the workspace. Below a write floor the application stays and reads: the verdict is folded into
 * what the session holds, the held API context is dropped so every create, edit and delete is
 * refused for the version, and the rows the pull brought are announced without the reconcile,
 * which writes the derived columns. The read-only notice reads the same verdict off the state.
 */
export async function applySyncOutcome(machine: StartupMachine, outcome: SyncOutcome) {
	const state = await machine.ports.sync.getState().catch(() => null);
	const open = (state ?? machine.current.sync)?.workspace.remoteId ?? null;

	if (outcome.workspaceId !== open) {
		return;
	}

	if (await isPastReading(machine, outcome, open)) {
		return;
	}

	await rereadOrganization(machine);
	foldVerdict(machine, outcome.heldByVersion);

	if (state) {
		machine.set({ sync: state });
		machine.ports.cache.rememberRemoteSync(state);
	}

	await machine.ports.cache.invalidateRemoteSync();

	if (!outcome.received) {
		return;
	}

	// read-only: the rows are shown, and nothing is reconciled into data this build may not write.
	if (machine.heldByVersion.length > 0) {
		await machine.ports.cache.invalidateAll();

		return;
	}

	await machine.reconciliation.received();
}

/**
 * Where the dispatch found the organization or the open workspace past what this build reads, put
 * the person where a way in the version refused puts them, and answer whether it did.
 *
 * **The verdicts on the answer, or the code a dispatch threw with**: the shell carries a raise it
 * pulled as `heldByVersion`, and a dispatch it refused outright for the version says so in its
 * code, which stands for the same verdict without its sentence. Either way the routing is the
 * machine's one (`pastReading`), which a way in follows too. Any other refusal is not this
 * function's: a heartbeat that failed is retried by the sync manager, and nobody is moved off what
 * they are doing for one.
 */
async function isPastReading(machine: StartupMachine, outcome: SyncOutcome, open: string | null) {
	return machine.pastReading(
		[...outcome.heldByVersion, ...refusedFor(outcome.refusal, open)],
		open
	);
}

/** the verdict a dispatch refused outright for the version stands for, where it was one. */
function refusedFor(refusal: string | null | undefined, open: string | null): HeldByVersion[] {
	if (refusal === 'organizationNewer') {
		return [{ target: 'organization', standing: 'unreadable', reason: '' }];
	}

	if (refusal === 'workspaceNewer' && open) {
		return [{ target: { workspace: open }, standing: 'unreadable', reason: '' }];
	}

	return [];
}

/**
 * Keep the dispatch's verdict on what the session holds, so everything that reads the snapshot
 * reads it at once, whatever the read of the state just answered: the day's reconcile asks it
 * (`./reconcile`), and the next read of the state says the same thing, since the shell keeps it.
 */
function foldVerdict(machine: StartupMachine, heldByVersion: HeldByVersion[]) {
	const organization = machine.current.organization;

	if (heldByVersion.length === 0 || !organization) {
		return;
	}

	machine.set({ organization: { ...organization, heldByVersion } });
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
