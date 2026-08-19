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
 * CONTEXT
 *
 * the per-request context. it carries only ambient capabilities that cross the process
 * boundary (database, host) or are nondeterministic (clock); business configuration
 * never enters it.
 */
export type Context = {
	db: Database;
	clock: Clock;
	host: Host;
};

const systemClock: Clock = {
	now: () => Date.now()
};

/**
 * builds the context with its dependencies supplied. each defaults to the real
 * capability, so `context()` with no arguments is unchanged for existing callers.
 * the database and host singletons pull in the Tauri runtime, so they are imported
 * lazily and only when not supplied — importing this module stays free of it.
 */
export const context = async (overrides: Partial<Context> = {}): Promise<Context> => {
	const db = overrides.db ?? (await import('$lib/platform/database/client')).db;
	const host = overrides.host ?? (await import('$lib/platform/tauri')).tauri;
	const clock = overrides.clock ?? systemClock;

	return { db, clock, host };
};
