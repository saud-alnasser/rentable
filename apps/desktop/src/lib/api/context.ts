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
 * who is acting.
 *
 * **Optional as this is written, and no longer for the reason it was made optional.** It was
 * absent in the ordinary case because a local-only workspace had no owner; that population is
 * gone, and #571 puts a sign-in in front of the whole application, so by the time any surface
 * calls a procedure there is an account. Making it required is #567, and it is a real change
 * rather than a formality — `actingIdentity` below still resolves through the Drive link.
 *
 * What none of that reopens is the shape that was rejected: a required identity with an
 * anonymous placeholder standing in. It makes a request carry a fiction, and the fiction is
 * indistinguishable from a real user at every call site.
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
	 * who is acting.
	 *
	 * Optional, and the key is **omitted** rather than set to `undefined` — so a procedure
	 * reading it sees the shape every request has always had, and no existing procedure has to
	 * learn that identity exists in order to keep working. #567 is where that stops being true.
	 */
	identity?: Identity;
};

const systemClock: Clock = {
	now: () => Date.now()
};

/**
 * who the shell says is acting, or nothing.
 *
 * **A question the shell may be unable to answer**, and an unanswered one is not a failure: this
 * runs while the application is still starting, and a client that is not the desktop shell may
 * not offer the capability at all.
 *
 * **It reads the Drive link, and that is wrong rather than subtle.** `workspace.accountId` has
 * one writer in the tree — `link_workspace_to_google_drive` — so as written this can answer only
 * for a workspace linked to a Drive folder, and answers nothing for the ordinary signed-in
 * machine. The read that belongs here is `signedInAccount` in `$lib/sync/sign-in`, and swapping
 * it is #567's, along with making the result required.
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
 * builds the context with its dependencies supplied. each defaults to the real capability, so
 * `context()` with no arguments answers as it always has for existing callers — it asks the
 * shell who is acting on the way.
 * the database and host singletons pull in the Tauri runtime, so they are imported
 * lazily and only when not supplied — importing this module stays free of it.
 *
 * `identity` is read from `overrides` by key rather than by value, because absent and
 * `undefined` mean the same thing to a caller and only the key can say which was meant.
 *
 * **Built on first use rather than at module load, and forgotten when the identity changes.**
 * It used to be built while `./caller` was being imported, which fixed the identity it resolved
 * for the life of the process — free while nothing could change one, and no longer free now that
 * signing in is a screen inside the running application. `forgetContext` in `./caller` is the
 * other half, and signing in and out are the two moments that call it.
 */
export const context = async (overrides: Partial<Context> = {}): Promise<Context> => {
	const db = overrides.db ?? (await import('$lib/platform/database/client')).db;
	const host = overrides.host ?? (await import('$lib/platform/tauri')).tauri;
	const clock = overrides.clock ?? systemClock;
	const identity = 'identity' in overrides ? overrides.identity : await actingIdentity(host);

	return identity ? { db, clock, host, identity } : { db, clock, host };
};
