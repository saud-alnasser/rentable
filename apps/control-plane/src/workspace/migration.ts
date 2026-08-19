import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Client } from '@libsql/client';
import { workspaceMigrationsFolder } from '@rentable/workspace-migrations';

import { Refusal, WORKSPACE_UNAVAILABLE } from '../failure.ts';

/**
 * Bringing a **hosted workspace database** up to a schema version.
 *
 * **Two databases are in play in this package and this file talks to exactly one of them.**
 * `database/database.ts` is the control plane's *own* database — accounts, workspaces,
 * membership — migrated by drizzle-kit from `../../migrations`. What is here is the other: the
 * Turso database one workspace's ledger lives in, reached over libSQL with a token this service
 * minted for it, and touched only to apply DDL. **It is the only runner there is** — requirement
 * 11 took the desktop's away, so a workspace's schema is applied here and reaches a machine as
 * replicated pages.
 * **No row of anybody's ledger is read or written here** — the API is in the credential path
 * continuously and in the data path never, and applying a schema is not the data path.
 *
 * Decision 06 named the control-plane API as the owner of a hosted workspace's schema and the
 * token mint as where it acts; `./workspace.ts` is the mint and this is what it calls.
 */

/**
 * The workspace migrations this build ships, which are the same ones the desktop ships.
 *
 * **`@rentable/workspace-migrations`, and there is exactly one copy of them.** The SQL that builds
 * a workspace database is the same whether that database is local or hosted, so it is a package
 * both consumers depend on rather than a directory inside either. *This replaced a copy under
 * `apps/control-plane/`, which was wrong twice: the guard holding the two directories identical
 * was hashed only against this package's own files, so the commit that broke it would not have
 * run it — and the monorepo effort's spec had already written the removal condition, "the schema
 * is extracted into its own package the moment a second consumer exists". A hosted workspace's
 * migrations are that second consumer.*
 *
 * `src/tests/boundary.test.ts` permits this one workspace specifier and no other. The property it
 * guards is that no domain module and no domain row reaches this API, and a package of DDL
 * carries neither: there is nothing here to import, and nothing here that could become a route's
 * answer.
 */
const FOLDER = workspaceMigrationsFolder;

/**
 * What this service has applied to a workspace database, kept in the database it applied it to.
 *
 * **The ledger is the authority and the workspace record is an index of it**, which is why it
 * lives here rather than only in the control plane's own tables: a mint that failed partway
 * leaves the two disagreeing, and the one that was written by the statements that actually ran is
 * the one to believe.
 *
 * *It is shaped exactly as the desktop's own runner wrote it — same table, same columns, same key
 * — because that runner used to read it off the replica to decide what to apply. It applies
 * nothing now (requirement 11), so the shape is inherited rather than owed to anybody.*
 */
const LEDGER =
	'CREATE TABLE IF NOT EXISTS __migrations__(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);';

const RECORD_APPLIED = 'INSERT INTO __migrations__ (name) VALUES (?)';

const APPLIED = 'SELECT name FROM __migrations__';

export type WorkspaceMigration = {
	/** the file's own name, which is what the ledger is keyed by on both sides. */
	name: string;
	/** its statements, split on drizzle's `--> statement-breakpoint`, in order. */
	statements: string[];
};

/**
 * How a client reaches one hosted workspace database.
 *
 * **A port, for the same reason `TursoPlatform` is one**: the tests below run the real migration
 * code against a real libSQL database on a temporary file, which is the same client type a
 * deployed control plane opens against Turso. `./main.ts` is the only place a real hostname and a
 * real token meet it.
 */
export type ConnectToWorkspaceDatabase = (where: { url: string; authToken: string }) => Client;

/**
 * How long the token this service opens a workspace database with lives.
 *
 * **Minutes, and deliberately unlike `./workspace.ts`'s `TOKEN_LIFETIME`.** That one is a client's session and
 * is requirement 15's three days; this one is held by this process for the length of one
 * migration and never leaves it, so its window is the work rather than a person's absence.
 */
export const MIGRATION_TOKEN_LIFETIME = '30m';

let shipped: Promise<WorkspaceMigration[]> | undefined;

const read = async (): Promise<WorkspaceMigration[]> => {
	const names = (await readdir(fileURLToPath(FOLDER)))
		.filter((name) => name.endsWith('.sql'))
		// The same order the Rust runner applies them in — a plain sort over names drizzle-kit
		// numbers from `0000`. Nothing here parses the number out: two runners agreeing on the
		// order matters more than either being clever about it.
		.sort();

	return Promise.all(
		names.map(async (name) => ({
			name,
			statements: (await readFile(new URL(name, FOLDER), 'utf8'))
				.split('--> statement-breakpoint')
				.map((statement) => statement.trim())
				.filter((statement) => statement !== '')
		}))
	);
};

/**
 * The shipped set, read once — it does not change while the process runs.
 *
 * **The cache is cleared when the read fails**, which is not a detail: memoising the promise
 * rather than the value means one transient failure at startup would be answered to every mint
 * for the life of the process, and every one of them would be a 500 about a directory that is
 * fine by now.
 */
export const workspaceMigrations = (): Promise<WorkspaceMigration[]> =>
	(shipped ??= read().catch((failure: unknown) => {
		shipped = undefined;
		throw failure;
	}));

/**
 * The schema version this build of the API can bring a workspace to.
 *
 * **It is the count of migrations shipped, so a deploy produces it** — nobody bumps a number, and
 * a migration that was generated and a version that was forgotten cannot come apart. The desktop
 * derives its own the same way, from the same set of files, which is what makes the two numbers
 * comparable at all.
 */
export const targetSchemaVersion = async (): Promise<number> =>
	(await workspaceMigrations()).length;

/**
 * Everything the libSQL side can fail with, as a refusal the caller can act on.
 *
 * **`turso.ts` types the Platform API and nothing typed the database protocol**, so a workspace
 * database that would not answer — its libSQL endpoint down while the Platform API is up, or two
 * mints colliding on one migration — reached the server's generic catch and went out as a `500`
 * saying nothing. It is the same cause as `workspace_unavailable` and it gets the same code: this
 * is a moment that passes, and the caller's move is to try again.
 */
const unavailable = <T>(what: string, act: () => Promise<T>): Promise<T> =>
	act().catch((failure: unknown) => {
		if (failure instanceof Refusal) {
			throw failure;
		}

		// The libSQL message names a table or a hostname. It goes to this process's log, and the
		// caller — who is asking about a workspace — is told what to do instead.
		console.error(`could not ${what}`, failure);

		throw new Refusal(
			WORKSPACE_UNAVAILABLE,
			503,
			`could not ${what} just now. try again in a moment`
		);
	});

const alreadyApplied = async (client: Client): Promise<Set<string>> => {
	const { rows } = await client.execute(APPLIED);

	return new Set(rows.map((row) => String(row.name)));
};

/**
 * One migration at a time per workspace database, within this process.
 *
 * **Two devices arriving at once is the case this effort exists for**, and two mints migrating one
 * database in parallel both read an empty ledger and both run `CREATE TABLE` — the second failing
 * on a table the first had just made. The state is safe either way, because each file is one
 * atomic batch; what is not safe is that the loser sees an error about a table, which is neither
 * its problem nor something it can act on. A mint waiting behind another mint gets the migration's
 * result instead.
 *
 * **In this process only, and that is honest rather than complete.** Two API instances would still
 * collide, and what stops that being a defect is the typed refusal above: the loser is told to try
 * again, and its retry finds the work done. A lock across instances would be a lease in a database
 * and is a different ticket's — this is the cheap half that removes the ordinary case.
 */
const migrating = new Map<string, Promise<unknown>>();

const oneAtATime = async <T>(key: string, act: () => Promise<T>): Promise<T> => {
	const queued = (migrating.get(key) ?? Promise.resolve()).then(act, act);

	migrating.set(
		key,
		queued.catch(() => {})
	);

	try {
		return await queued;
	} finally {
		// Only if nothing else queued behind it, or the next caller's turn would be dropped.
		if (migrating.get(key) === queued) {
			migrating.delete(key);
		}
	}
};

/**
 * How far a database has been migrated: the length of the run of shipped migrations, from the
 * first, that its ledger records.
 *
 * A prefix rather than a count, because a gap is not a version. A ledger holding `0000`, `0001`
 * and `0003` is at 2 — the fourth migration was applied against a schema the third never made,
 * and calling that 3 would tell the mint the workspace is somewhere it is not.
 */
const versionOf = (migrations: WorkspaceMigration[], applied: Set<string>): number => {
	const missing = migrations.findIndex((migration) => !applied.has(migration.name));

	return missing === -1 ? migrations.length : missing;
};

/**
 * Apply every shipped migration up to `upTo` that this database has not had, and answer the
 * version it is now at.
 *
 * **`upTo` is a ceiling and the caller sets it to the version its client was built against**, so
 * a workspace is never taken past what the client asking to open it understands. Applying
 * everything this build ships instead would be the same defect the refusal at the mint exists to
 * prevent, arriving from the other side: a client at 4 handed a database at 5 replicates columns
 * it does not know about. The sweep is the one caller that passes the full target, and doing that
 * deliberately — ahead of the users — is the whole of what a sweep is for.
 *
 * **Each file is one atomic batch**, through `migrate`, which wraps the statements in a
 * transaction and turns foreign key enforcement off around it. A file that fails leaves the
 * database exactly where it was and the ledger unwritten, so the next attempt starts from the
 * same place rather than from halfway.
 */
export const migrateWorkspaceDatabase = (
	client: Client,
	upTo: number,
	{ database }: { database: string }
): Promise<number> =>
	oneAtATime(database, () =>
		unavailable('bring that workspace up to date', async () => {
			const migrations = (await workspaceMigrations()).slice(0, upTo);

			await client.execute(LEDGER);

			const applied = await alreadyApplied(client);

			for (const migration of migrations) {
				if (applied.has(migration.name)) {
					continue;
				}

				await client.migrate([
					...migration.statements,
					{ sql: RECORD_APPLIED, args: [migration.name] }
				]);

				applied.add(migration.name);
			}

			return versionOf(await workspaceMigrations(), applied);
		})
	);

/**
 * What a workspace database's own ledger says it is at, asked directly.
 *
 * Used after a migration has failed, to record where it actually got to. **The ledger is the
 * authority and the workspace record is an index of it**, so a failure that leaves the two
 * disagreeing is a failure that leaves the mint deciding on a number that is too low — and a
 * number that is too low is what lets an older client through.
 */
export const versionOfWorkspaceDatabase = async (client: Client): Promise<number> => {
	await client.execute(LEDGER);

	return versionOf(await workspaceMigrations(), await alreadyApplied(client));
};
