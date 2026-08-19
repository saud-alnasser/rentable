import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import type { Host } from '$lib/platform/host';

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
 * who is acting, where the workspace has an owner at all.
 *
 * A hosted workspace has one and a local workspace has none, so this is **absent in the
 * ordinary case rather than in an error case** — a local-only user never signs in, and the
 * application knows of no user in that case. The rejected shape was a required identity with
 * an anonymous placeholder standing in for those users: it makes every local request carry a
 * fiction, and the fiction is indistinguishable from a real user at every call site.
 *
 * What a *user record* holds is not settled here — it is the control plane's, and it arrives
 * with the accounts it describes. These three fields are what this application can already
 * say about a person today, and all three survive whatever the control plane adds.
 */
export type Identity = {
	/** the account row this machine holds, which is not yet the same thing as a user id. */
	accountId: string;
	email: string;
	displayName: string;
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
	/**
	 * who is acting, where the workspace has an owner.
	 *
	 * Optional, and the key is **omitted** rather than set to `undefined` — so a procedure
	 * reading it sees the same shape a local request has always had, and no existing procedure
	 * has to learn that identity exists in order to keep working.
	 */
	identity?: Identity;
};

const systemClock: Clock = {
	now: () => Date.now()
};

/**
 * who the shell says is acting, or nothing.
 *
 * **A question the shell may be unable to answer**, and an unanswered one is not a hosted
 * workspace: this runs while the application is still starting, and a client that is not the
 * desktop shell may not offer the capability at all. Refusing to build a context over it would
 * fail the boot of a local-only workspace over an identity that workspace does not have and no
 * procedure is going to ask for.
 *
 * The mode is what decides, not the sign-in. Somebody may be signed in to Google with a purely
 * local workspace — signing in is its own act — and that person is not *acting as* anybody as
 * far as a request is concerned.
 */
async function actingIdentity(host: Host): Promise<Identity | undefined> {
	let state;

	// only the asking is guarded, and deliberately: a failure to reach the shell is an
	// unanswered question, while a failure to make sense of the answer is a defect, and
	// swallowing the second inside the first would report it as a request nobody made.
	try {
		state = await host.remoteSync.getState();
	} catch {
		return undefined;
	}

	const account = state.accounts.find((candidate) => candidate.id === state.workspace.accountId);

	return (
		account && {
			accountId: account.id,
			email: account.email,
			displayName: account.displayName
		}
	);
}

/**
 * builds the context with its dependencies supplied. each defaults to the real
 * capability, so `context()` with no arguments answers as it always has for existing
 * callers — it now asks the shell what mode the workspace is in on the way, which a
 * local workspace answers with no identity.
 * the database and host singletons pull in the Tauri runtime, so they are imported
 * lazily and only when not supplied — importing this module stays free of it.
 *
 * `identity` is read from `overrides` by key rather than by value, because absent and
 * `undefined` mean the same thing to a caller and only the key can say which was meant.
 *
 * **This is built once, at module load** (`./caller`), so the identity it resolves is the one
 * the workspace had then. That costs nothing today — nothing can turn a workspace hosted while
 * the application is running — and it stops being free the moment something can: converting a
 * local workspace (#551) and choosing a mode (#553) are where that has to be answered, by
 * rebuilding the context or by restarting.
 */
export const context = async (overrides: Partial<Context> = {}): Promise<Context> => {
	const db = overrides.db ?? (await import('$lib/platform/database/client')).db;
	const host = overrides.host ?? (await import('$lib/platform/tauri')).tauri;
	const clock = overrides.clock ?? systemClock;
	const identity = 'identity' in overrides ? overrides.identity : await actingIdentity(host);

	return identity ? { db, clock, host, identity } : { db, clock, host };
};
