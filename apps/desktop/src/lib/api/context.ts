import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import type { Host } from '$lib/platform/host';
import { signedInAccount } from '$lib/sync/account';

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
 * what the API may ask of the shell it runs in. Declared in `$lib/platform/host` and
 * satisfied by the Tauri facade, rather than read off that facade with `typeof` — so there
 * is an interface for a client that is not the desktop shell to implement.
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
 * is here is the fact — who is acting, or nobody — and the refusal is one middleware away for the
 * forty-six procedures that need somebody.
 *
 * **This is not the shape decision 03 rejected, and the difference is the whole point of `null`.**
 * What that decision called the harder of the two failures was an *anonymous placeholder* standing
 * in for absent users — every request carrying a fiction indistinguishable from a real user at
 * every call site. `null` is the opposite of a fiction: it cannot be mistaken for a person, it
 * does not type-check where a person is wanted, and the middleware that refuses it is the only
 * thing between it and a procedure.
 *
 * What a *user record* holds is not settled here — it is the control plane's, and it arrives
 * with the accounts it describes. The first three fields are what this application can already
 * say about a person today, and all three survive whatever the control plane adds. The fourth is
 * not about the person at all: it is about this account *in this workspace*, which is why it
 * arrives with the workspace rather than with the account.
 */
export type Identity = {
	/** the account row this machine holds, which is not yet the same thing as a user id. */
	accountId: string;
	email: string;
	displayName: string;
	/**
	 * what this account may do in the workspace this machine holds.
	 *
	 * **Here because it is a fact about who is acting**, which is what `Identity` is for — and not
	 * on the context beside `db` and `host`, which carry ambient capabilities and never business
	 * configuration ([[rules/api-layer]], under *Where things live*).
	 *
	 * **Never read as a number.** `permits` from `@rentable/workspace-permission` answers a
	 * question about it by the name of an act, and that package is the only place the bits are
	 * named — on this side or the control plane's.
	 *
	 * `0` where the shell could not be reached, where the control plane has said nothing, and on
	 * a machine nobody is signed in on. All three mean the same thing to a procedure: this caller
	 * administers nothing.
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
 * **It reads who is signed in.** It used to resolve through `workspace.accountId`, which only a
 * Google Drive link ever wrote — so it could answer only for a workspace linked to a folder, and
 * answered nothing for the ordinary signed-in machine. Drive sync retired and the field went with
 * it; `signedInAccount` reads the account rows, which is the same read the sign-in wall admits
 * on, so the two cannot come to disagree about who is here.
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
		state = await host.remoteSync.getState();
	} catch {
		return null;
	}

	const account = signedInAccount(state);

	return (
		account && {
			accountId: account.id,
			email: account.email,
			displayName: account.displayName,
			// **Off the same answer, on the same read.** The workspace is on the object
			// `signedInAccount` was just handed, so what this account may do costs nothing beyond
			// what resolving who they are already cost.
			permissions: state.workspace.permissions
		}
	);
}

/**
 * builds the context with its dependencies supplied. each defaults to the real capability, so
 * `context()` with no arguments answers as it always has for existing callers — it asks the
 * shell who is acting on the way.
 * the database and host singletons pull in the Tauri runtime, so they are imported
 * lazily and only when not supplied — importing this module stays free of it.
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
export const context = async (overrides: Partial<Context> = {}): Promise<Context> => {
	const db = overrides.db ?? (await import('$lib/platform/database/client')).db;
	const host = overrides.host ?? (await import('$lib/platform/tauri')).tauri;
	const clock = overrides.clock ?? systemClock;
	const identity = overrides.identity ?? (await actingIdentity(host));

	// **Answering with nobody is not the same as letting anybody through.** Forty-six procedures reach
	// the workspace database and every one of them goes through `procedure.member`, which refuses
	// exactly this. What is left public is host-only and has no actor to name: this machine's own
	// settings, its updater, and what the shell knows about syncing.
	return { db, clock, host, identity };
};
