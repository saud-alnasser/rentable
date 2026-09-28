import {
	effectiveIn,
	effectiveInWorkspace,
	type AccessLevel
} from '@rentable/workspace-permission';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import type { Host } from '$lib/app/host';
import type { OrganizationSession } from '$lib/organization/host';

/**
 * DATABASE
 *
 * the database client, typed structurally as any sqlite-proxy client over the schema
 * rather than as the type of the app singleton — so a test client satisfies it too.
 */
export type Database = SqliteRemoteDatabase<typeof import('$lib/platform/database/schema')>;

/**
 * CLOCK
 *
 * a source of the current wall-clock time. nondeterministic, so it is supplied rather
 * than read from the ambient `Date`.
 */
export type Clock = {
	now: () => number;
};

/**
 * HOST
 *
 * what the API may ask of the shell it runs in. Composed in `$lib/app/host` from the ports that
 * declare it and satisfied by their Tauri adapters, rather than read off an adapter with `typeof`,
 * so there is an interface for a client that is not the desktop shell to implement. Named here by
 * type alone, so the wiring loads no feature.
 */
export type { Host };

/**
 * IDENTITY
 *
 * who is acting, or nobody.
 *
 * **It was required, and the premise that made it required is gone.** #547 made it absent in the
 * ordinary case, because a local-only workspace had no owner. #571 made it required on the ground
 * that a sign-in stood in front of the whole application, "so there is no request without a
 * signed-in user". *That sentence stopped being true on 2026-08-20*: requirement 7 of
 * [[efforts/capabilities-only-one-surface-got]] draws the shell before anybody signs in, and its
 * account row offers settings — a page that is host-only from end to end and has no business
 * needing an actor.
 *
 * **So the absence is expressible again, and the refusal moved rather than went.** It is
 * `procedure.member`'s now, in `./trpc`, which is a better place for it than here: whether a call
 * needs an acting user is a property of the call, and a context is not the thing making one. What
 * is here is the fact, who is acting or nobody, and the refusal is one middleware away for every
 * procedure that is not `public`.
 *
 * **This is not the shape decision 03 rejected, and the difference is the whole point of `null`.**
 * What that decision called the harder of the two failures was an *anonymous placeholder* standing
 * in for absent users — every request carrying a fiction indistinguishable from a real user at
 * every call site. `null` is the opposite of a fiction: it cannot be mistaken for a person, it
 * does not type-check where a person is wanted, and the middleware that refuses it is the only
 * thing between it and a procedure.
 *
 * What a *user record* holds is not settled here: it is the organization's member row, and it
 * arrives with the session that unsealed it. The first two fields are what this application can
 * already say about a person today, and both survive whatever the row grows. The third is
 * not about the person at all: it is about this account *in this workspace*, which is why it
 * arrives with the workspace rather than with the account.
 */
export type Identity = {
	/** the account row this machine holds, which is not yet the same thing as a user id. */
	accountId: string;
	/** the one thing that names the member; there is no address and no display name beside it. */
	username: string;
	/**
	 * what this member may do in the workspace this machine has open, as the flags every
	 * `procedure.permitted` gate reads.
	 *
	 * **Their effective permissions in that workspace, folded by its grant.** The session carries
	 * what their role and override come to across the organization, off their verified row, and
	 * what is pinned for them in each workspace they are in; `effectiveInWorkspace` sets the
	 * record flags pinned in the workspace open, and `effectiveIn` clears every create, edit and
	 * delete where their grant on it is read-only, or where there is no grant or no workspace open
	 * to read. The organization's own flags are not a workspace's to pin or clear and pass through
	 * as the session has them ([`permissionsIn`]).
	 *
	 * **Here because it is a fact about who is acting**, which is what `Identity` is for, and not
	 * on the context beside `db` and `host`, which carry ambient capabilities and never business
	 * configuration ([[rules/api-layer]], under *Where things live*).
	 *
	 * **Never read as a number.** `permits` from `@rentable/workspace-permission` answers a
	 * question about it by the name of an act; that package names the bits on this side, and
	 * `permission.rs` carries the same bits under the same names on the Rust side.
	 *
	 * Where the shell could not be reached or nobody is signed in there is no identity at all,
	 * and so nothing to read this off.
	 */
	permissions: number;
};

/**
 * CONTEXT
 *
 * the per-request context. it carries only ambient capabilities that cross the process
 * boundary (database, host, identity) or are nondeterministic (clock); business configuration
 * never enters it.
 */
export type Context = {
	db: Database;
	clock: Clock;
	host: Host;
	/** who is acting, or `null` where nobody is signed in on this machine. */
	identity: Identity | null;
};

const systemClock: Clock = {
	now: () => Date.now()
};

/**
 * who the shell says is acting, or nobody.
 *
 * **It reads whose vault is open.** It used to read who was signed in with Google, off the same
 * state the sign-in wall admitted on, and it reads the organization state now for the same
 * reason: the wall admits a member whose password opened a vault, and this is the same read, so
 * the two cannot come to disagree about who is here. The member's id stands where an account id
 * stood, because a member is what an account became.
 *
 * A shell that cannot be reached answers nobody rather than throwing here. The refusal belongs
 * to the caller below, which states it once for both ways of having no acting user: a client
 * that is not this shell and a machine nobody has signed in on are the same situation to a
 * procedure.
 */
async function actingIdentity(host: Host): Promise<Identity | null> {
	let state;

	// only the asking is guarded, and deliberately: a failure to reach the shell is an
	// unanswered question, while a failure to make sense of the answer is a defect, and
	// swallowing the second inside the first would report it as a request nobody made.
	try {
		state = await host.organization.getState();
	} catch {
		return null;
	}

	const session = state.session;

	return (
		session && {
			accountId: session.memberId,
			username: session.username,
			// **Off the same answer, for the workspace open** (effort 838, requirements 10 and 12).
			// What this member may do across the organization is on their verified row, and the
			// session carries it with what is pinned for them in each workspace; in the workspace
			// this machine has open, those pins apply, and a read-only grant clears every create,
			// edit and delete whatever the role and the overrides say.
			permissions: permissionsIn(session, await openWorkspace(host))
		}
	);
}

/**
 * the workspace this machine has open, by id, or `null` where the shell cannot say or none is.
 *
 * **Read-only wherever that cannot be said** ([`accessIn`]): a shell that cannot say which
 * workspace is open, a machine with none open, and a workspace the session holds no grant on. It
 * is the safe direction, and it costs nothing a caller could want, since there are no records to
 * write without an open workspace, and the organization's own flags are not a workspace's to clear.
 */
async function openWorkspace(host: Host): Promise<string | null> {
	try {
		return (await host.sync.getState()).workspace.remoteId;
	} catch {
		// said above: no workspace that can be named is read-only.
		return null;
	}
}

/**
 * what a member may do in one workspace before its grant is read, from their session and the
 * workspace's id: their permissions across the organization with the record flags pinned for that
 * workspace set as they are granted there (effort 838, requirement 12 as amended a third time, and
 * at review round one), and those permissions as they are where there is no workspace or no grant.
 *
 * **Computed from the pins by the one routine** (`effectiveInWorkspace`), rather than read off
 * the workspace's `permissions`: the two are the same number, which the shared table holds Rust
 * and the package to, and this way the organization's own flags always come from the session.
 * Exported so the interface reads the same value a procedure is answered by.
 */
export function workspacePermissionsIn(
	session: OrganizationSession,
	openWorkspaceId: string | null
): number {
	const grant = session.workspaces.find((workspace) => workspace.id === openWorkspaceId);

	return effectiveInWorkspace(session.permissions, grant?.pinned ?? 0, grant?.granted ?? 0);
}

/**
 * what a member may do in one workspace, from their session and the workspace's id: what they may
 * do there ([`workspacePermissionsIn`]) folded by how their grant reaches it ([`accessIn`]). What
 * every `procedure.permitted` gate is answered by.
 */
export function permissionsIn(
	session: OrganizationSession,
	openWorkspaceId: string | null
): number {
	return effectiveIn(
		workspacePermissionsIn(session, openWorkspaceId),
		accessIn(session, openWorkspaceId)
	);
}

/**
 * how a member reaches one workspace, from their session and the workspace's id: the access on
 * their grant for it, and read-only where there is no workspace or no grant.
 *
 * **Exported so the interface folds the same way** (effort 838, requirement 10): what a record
 * control offers is read from the same session and the same open workspace this reads, so a
 * control and the procedure behind it cannot disagree about a read-only grant.
 */
export function accessIn(
	session: OrganizationSession,
	openWorkspaceId: string | null
): AccessLevel {
	const grant = session.workspaces.find((workspace) => workspace.id === openWorkspaceId);

	return grant?.accessLevel === 'full-access' ? 'full-access' : 'read-only';
}

/**
 * builds the context with its dependencies supplied. each but the host defaults to the real
 * capability, and it asks the shell who is acting on the way.
 * the database singleton pulls in the Tauri runtime, so it is imported lazily and only when not
 * supplied, and importing this module stays free of it. **The host is always supplied**: it is
 * composed from the features' ports, which this home sits below, so the composition root binds
 * it in with the root router (`bindCaller` in `./caller`) and a test hands in its own.
 *
 * `identity` is read by value now, like every other member. It was read by key while it was
 * optional, because absent and `undefined` said different things then; with no way to want a
 * request that has no actor, they say the same thing and the distinction is spent.
 *
 * **Built on first use rather than at module load, and forgotten when the identity changes.**
 * It used to be built while `./caller` was being imported, which fixed the identity it resolved
 * for the life of the process — free while nothing could change one, and no longer free now that
 * signing in is a screen inside the running application. `forgetContext` in `./caller` is the
 * other half, and signing in and out are the two moments that call it.
 *
 * **Refusing is a rejected call and no longer a failed import**, which is what makes refusing
 * available at all: a context built at module load could only fail `$lib/api/caller` itself,
 * and with it every surface importing it, on the clean install every user starts from.
 */
export const context = async (
	overrides: Partial<Context> & Pick<Context, 'host'>
): Promise<Context> => {
	const db = overrides.db ?? (await import('$lib/platform/database/client')).db;
	const host = overrides.host;
	const clock = overrides.clock ?? systemClock;
	const identity = overrides.identity ?? (await actingIdentity(host));

	// **Answering with nobody is not the same as letting anybody through.** Every procedure but a
	// `public` one refuses exactly this, since `permitted`, `permittedAny` and `permittedBy` each
	// ask `procedure.member`'s question first, and everything that reaches the workspace database
	// is one of them. What is left public is host-only and has no actor to name: this machine's own
	// settings, its updater, what the shell knows about syncing, and the calls that come before
	// there is anybody to act as.
	return { db, clock, host, identity };
};
