import { TRPCError } from '@trpc/server';
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
 * who is acting.
 *
 * **Required, and it was optional for a population that no longer exists.** #547 made it absent
 * in the ordinary case because a local-only workspace had no owner; #571 put a sign-in in front
 * of the whole application, so there is no request without a signed-in user and no procedure
 * has to reason about one.
 *
 * **This is the shape decision 03 rejected, and the reason it was rejected has to be re-read
 * rather than waved past.** What it called the harder of the two failures was a required
 * identity with an *anonymous placeholder* standing in for absent users — every request
 * carrying a fiction indistinguishable from a real user at every call site. Requirement 3
 * removes the need for the placeholder rather than the objection to it: this is always a real
 * person, and a context that cannot name one refuses instead of inventing one.
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
	identity: Identity;
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

	if (!identity) {
		// Nothing a machine needs before it has an account comes through here. The shell's own
		// capabilities are the shell's — a window is not a request, and neither is the locale the
		// sign-in screen is drawn in — so this refuses only what genuinely has an actor to name.
		throw new TRPCError({
			code: 'UNAUTHORIZED',
			message: 'no account is signed in on this machine'
		});
	}

	return { db, clock, host, identity };
};
