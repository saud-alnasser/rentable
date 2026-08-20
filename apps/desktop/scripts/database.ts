import { connect as connectSync } from '@tursodatabase/sync';
import BetterSqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as s from '../src/lib/platform/database/schema';

dotenv.config();

/**
 * WHICH DATABASE A DEV SCRIPT WRITES TO
 *
 * **`DATABASE_URL` stopped being the answer twice over, and the second one is the sharper.**
 *
 * *First:* it names one file, and a machine that has signed in does not have one. The workspace is
 * a Turso replica at `ws-<id>.db`, and `database/mod.rs` says it never meets `app.db` in those
 * words.
 *
 * *Second:* **`file:./tauri/app.db` is relative, and it means a different directory depending on
 * who reads it.** These scripts run from `apps/desktop`, so it resolved to
 * `apps/desktop/tauri/app.db`. The shell resolves it against its own working directory in dev and
 * lands on `<repo>/tauri/app.db` — a second folder with the same name, two levels up. The seed was
 * writing a real database that nothing reads, and reporting success, which is the worst of the
 * three possible outcomes.
 *
 * So neither is guessed any more. **`settings.json` is where the shell states its database path,
 * and `remote-sync.json` is where it states which workspace is current** — both in the app data
 * directory, both written by the application itself. `DATABASE_URL` is the fallback for a machine
 * that has never run it, and stays what `drizzle-kit` reads.
 *
 * **A replica may not be opened with `better-sqlite3`, and that is not a matter of taste.** The
 * Rust side records the reason: `sqlx` and `turso` are in disjoint locking domains — turso's WAL
 * index is `-tshm` where SQLite's is `-shm`, and neither engine can see the other's lock. Nothing
 * reports a breach, only eventual corruption. The second half is worse for a seed: **change
 * capture is armed per connection by a turso-only pragma**, so rows written through plain SQLite
 * produce no CDC and can never be pushed. They would look real, live only on this machine, and be
 * gone at the next pull.
 *
 * So a replica is opened through the same sync engine the application uses.
 *
 * **And it is opened with its remote, because a local write that cannot be pushed is a local write
 * that gets reverted.** *Corrected 2026-08-20, after a seed of five thousand tenants vanished.*
 * This opened the replica with no `url` and called that local-only, on the reasoning that the app
 * would push the captured changes later. It does not, and cannot: a replica's record of truth is the
 * hosted database, so the engine's next `pull` rewinds the local WAL to the last revision the server
 * acknowledged and lays the remote's pages over it. Changes the server never saw are what
 * `-wal-revert` exists to undo. The seed therefore looked like it worked, survived until the app
 * next synced, and disappeared — the same failure as writing the wrong file, wearing a longer fuse.
 *
 * **So a seed pulls first, writes, and pushes, and a run that cannot reach the remote fails instead
 * of writing.** The token is minted here the way the control plane mints one, from the Platform API
 * credential already in `apps/desktop/.env`, because these scripts have no user session to ask with.
 * That is a development convenience and is not a path the application has or should have.
 */

/** the fallback, for a machine the application has never run on. It is also `drizzle-kit`'s. */
const FALLBACK_URL = process.env.DATABASE_URL?.replace('file:', '') ?? './tauri/app.db';

/**
 * **`ws-<id>.db`, which is the control plane's own name for the database.** `databaseNameFor` in
 * `apps/control-plane/src/workspace/workspace.ts` builds `ws-<id>`, that is what Turso holds, and
 * it is what the remote URL says — so a directory listing matches the dashboard without anybody
 * translating. `replica_path` in `database/mod.rs` is the other half of this and must agree.
 */
const REPLICA = /^ws-(.+)\.db$/;

/** read from `tauri.conf.json` rather than written down twice. */
const IDENTIFIER = JSON.parse(readFileSync(resolve('tauri/tauri.conf.json'), 'utf8')).identifier;

export type Target = {
	/** the file that was opened. */
	path: string;
	/**
	 * `workspace` is a replica, through the sync engine. `local` is the plain file, which is what
	 * there is before anybody signs in.
	 */
	kind: 'workspace' | 'local';
	db: ReturnType<typeof drizzle<typeof s>>;
	begin: () => Promise<void>;
	commit: () => Promise<void>;
	rollback: () => Promise<void>;
	/**
	 * Send what was just written to the hosted database.
	 *
	 * On the plain file this does nothing and has nothing to do: there is no remote, so what was
	 * written is already where it lives. On a replica it is the half of the write that makes the
	 * other half survive.
	 */
	push: () => Promise<void>;
	close: () => Promise<void>;
};

/**
 * where the shell keeps what it has decided, which is Tauri's `app_data_dir` for the identifier.
 *
 * Not a Tauri call, because these scripts are not the shell — the three platform rules are the
 * whole of what that function does for a data directory, and they are stable.
 */
function appDataDirectory() {
	if (process.platform === 'win32') {
		return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), IDENTIFIER);
	}

	if (process.platform === 'darwin') {
		return join(homedir(), 'Library', 'Application Support', IDENTIFIER);
	}

	return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), IDENTIFIER);
}

function readShellFile<T>(name: string): T | null {
	const path = join(appDataDirectory(), name);

	if (!existsSync(path)) {
		return null;
	}

	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return null;
	}
}

/**
 * where a development build keeps its databases: the Tauri crate's own `data/`.
 *
 * **Computed the same way the crate computes it, rather than read from anywhere.** `lib.rs` uses
 * `CARGO_MANIFEST_DIR` joined with `data`, resolved when it compiles; this is that same directory
 * named from the other side. Neither can drift from the other without the string here or there
 * changing, which is the property `settings.json` could not give: **a stored path is a record of
 * where a previous launch put things**, and after the crate moved it went on naming the old place.
 * That is what had these scripts and the app opening different files.
 */
const DEV_DIRECTORY = resolve(fileURLToPath(new URL('../tauri/data', import.meta.url)));

/**
 * where to look, in the order to look.
 *
 * A development build is what these scripts are for, so its directory is asked first. An installed
 * build keeps its databases in the app data directory and states the path in `settings.json`,
 * which is asked second — and `DATABASE_URL` last, for a machine the application has never run on.
 */
function candidateDirectories() {
	const settings = readShellFile<{ databasePath?: string }>('settings.json');

	const paths = [
		join(DEV_DIRECTORY, 'app.db'),
		settings?.databasePath,
		resolve(FALLBACK_URL)
	].filter((path): path is string => typeof path === 'string');

	// first occurrence wins, so the dev directory stays first even when settings names it too
	return [...new Set(paths.map((path) => dirname(path)))];
}

/**
 * which workspace this machine currently holds, as the shell states it.
 *
 * **`remoteId` and not `id`.** The replica file is named for the workspace on the control plane,
 * which is what `replica_path` builds its name from; `workspace.id` is this machine's own record.
 * A machine that has held more than one workspace keeps the older replicas on disk, so asking
 * which is current is the difference between seeding the workspace and seeding a leftover.
 */
function currentWorkspace() {
	const state = readShellFile<{ workspace?: { remoteId?: string } }>('remote-sync.json');

	return state?.workspace?.remoteId ?? null;
}

/** an override, for reaching a replica the shell is not currently pointed at. */
function requestedWorkspace() {
	const flag = process.argv.indexOf('--workspace');

	if (flag !== -1 && process.argv[flag + 1]) {
		return process.argv[flag + 1];
	}

	return process.env.SEED_WORKSPACE ?? null;
}

/**
 * where the hosted database this replica answers to lives.
 *
 * **Read from the replica's own metadata first, and from the shell's record second.** The engine
 * writes `saved_configuration.remote_url` into `<replica>-info` when it first opens a workspace, so
 * the file states which remote it belongs to without anybody correlating two ids. `remote-sync.json`
 * is the fallback for a replica whose metadata predates that field.
 *
 * A replica with no remote in either place is a genuine local-only database — nothing to push to,
 * and nothing that will revert it.
 */
function remoteUrlFor(replicaPath: string) {
	const meta = replicaPath + '-info';

	if (existsSync(meta)) {
		try {
			const parsed = JSON.parse(readFileSync(meta, 'utf8')) as {
				saved_configuration?: { remote_url?: string };
			};
			const url = parsed.saved_configuration?.remote_url;

			if (typeof url === 'string' && url.trim() !== '') {
				return url;
			}
		} catch {
			// a metadata file that will not parse is the shell's to repair, and the fallback below
			// answers the same question from a file this script can already read.
		}
	}

	const state = readShellFile<{ workspace?: { remoteId?: string; remoteUrl?: string } }>(
		'remote-sync.json'
	);

	return state?.workspace?.remoteUrl ?? null;
}

/** the lifetime the control plane mints with, in Turso's own duration spelling. */
const TOKEN_LIFETIME = '3d';

/**
 * Mint a token for one workspace database, the way the control plane mints one.
 *
 * **This is the Platform API credential, not a member's token, and the difference matters.** The
 * application asks the control plane, which checks membership and mints a scoped token; a script has
 * no session to ask with, so it uses the same credential the control plane itself holds. That is
 * full access to every database in the organisation, which is why it lives in `.env` and why nothing
 * shipped goes anywhere near this function.
 *
 * The call is `apps/control-plane/src/workspace/turso.ts`'s `mintToken`, deliberately not imported:
 * that module builds a client around service configuration this script does not have, and copying
 * one URL is smaller than reaching across an app boundary for it.
 */
async function mintWorkspaceToken(workspaceId: string) {
	const token = process.env.TURSO_API_TOKEN;
	const organization = process.env.TURSO_ORG;

	if (!token || !organization) {
		throw new Error(
			'TURSO_API_TOKEN and TURSO_ORG are needed to reach the hosted workspace, and one of them ' +
				'is missing from apps/desktop/.env. Without them a write here would be reverted at the ' +
				'next sync, so nothing was written.'
		);
	}

	const url = new URL(
		`https://api.turso.tech/v1/organizations/${organization}/databases/ws-${workspaceId}/auth/tokens`
	);

	url.searchParams.set('expiration', TOKEN_LIFETIME);
	url.searchParams.set('authorization', 'full-access');

	const response = await fetch(url, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}` }
	});

	if (!response.ok) {
		throw new Error(
			`turso refused to mint a token for ws-${workspaceId} (${response.status}). nothing was ` +
				'written, because a write that cannot be pushed does not survive the next sync.'
		);
	}

	const body = (await response.json()) as { jwt?: unknown };

	if (typeof body.jwt !== 'string' || body.jwt.trim() === '') {
		throw new Error(`turso minted a token for ws-${workspaceId} and returned no jwt.`);
	}

	return body.jwt;
}

function findReplicas(directory: string) {
	let entries: string[];

	try {
		entries = readdirSync(directory);
	} catch {
		return [];
	}

	const found: { id: string; path: string }[] = [];

	for (const entry of entries) {
		const match = REPLICA.exec(entry);

		if (match) {
			found.push({ id: match[1], path: join(directory, entry) });
		}
	}

	return found;
}

/**
 * Open what this machine's application would open, and say which it was.
 *
 * **It reports the file rather than assuming it.** A seed that writes somewhere invisible is worse
 * than one that fails, because it looks like it worked — which is exactly what these scripts did,
 * for two separate reasons, until this was written.
 */
export async function openWorkspaceDatabase(): Promise<Target> {
	const directories = candidateDirectories();
	const wanted = requestedWorkspace() ?? currentWorkspace();

	const found = directories.flatMap((directory) =>
		findReplicas(directory).map((replica) => ({ ...replica, directory }))
	);

	// **A named workspace with no file is reported rather than silently skipped past**, because the
	// two situations it distinguishes need different answers: a machine that has never opened this
	// workspace has to open the app once, and a machine that has just moved its files has to be
	// told where they were looked for.
	const chosen = wanted ? found.find((replica) => replica.id === wanted) : undefined;

	if (wanted && !chosen) {
		const nearby = found.map((replica) => replica.id).join(', ') || 'none';

		throw new Error(
			`the shell holds workspace ${wanted} and no replica for it was found. looked in: ` +
				`${directories.join(', ')}. replicas seen: ${nearby}. open the app once so it opens one.`
		);
	}

	if (!chosen) {
		const plainPath = join(directories[0], 'app.db');

		console.log(
			`nobody is signed in on this machine, so this writes the plain file — ` +
				`${plainPath}, which is what the app opens before a workspace exists.`
		);

		return openPlain(plainPath);
	}

	const leftovers = found.length - 1;

	console.log(
		`workspace ${chosen.id}, through the sync engine (${chosen.path})` +
			(leftovers > 0 ? `; ${leftovers} other replica(s) seen, untouched` : '')
	);

	return openReplica(chosen.path, chosen.id);
}

/**
 * drizzle's proxy contract, which both engines answer the same way.
 *
 * `run` returns nothing, `get` returns one row as an array of values, and everything else returns
 * rows as arrays of values. It is the same translation `database/proxy.rs` performs for the
 * application, which is why these scripts can use the schema the application uses without either
 * of them knowing which engine is underneath.
 */
type Execute = (
	sql: string,
	params: unknown[],
	method: 'run' | 'all' | 'values' | 'get'
) => Promise<{ rows: unknown[] }>;

function openPlain(path: string): Target {
	const sqlite = new BetterSqlite3(path);

	// the seed issues tens of thousands of statements and most of them are the same handful of
	// strings. Preparing each one once is the difference between seconds and minutes.
	const cache = new Map<string, BetterSqlite3.Statement>();

	const prepare = (sql: string) => {
		const held = cache.get(sql);

		if (held) {
			return held;
		}

		const statement = sqlite.prepare(sql);
		cache.set(sql, statement);

		return statement;
	};

	const execute: Execute = async (sql, params, method) => {
		const statement = prepare(sql);

		if (method === 'run') {
			statement.run(params);

			return { rows: [] };
		}

		statement.raw(true);

		if (method === 'get') {
			return { rows: (statement.get(params) as unknown[]) ?? [] };
		}

		return { rows: statement.all(params) as unknown[] };
	};

	return {
		path,
		kind: 'local',
		db: drizzle(execute, { schema: s }),
		begin: async () => sqlite.exec('BEGIN'),
		commit: async () => sqlite.exec('COMMIT'),
		rollback: async () => sqlite.exec('ROLLBACK'),
		push: async () => {},
		close: async () => void sqlite.close()
	};
}

async function openReplica(path: string, workspaceId: string): Promise<Target> {
	const remoteUrl = remoteUrlFor(path);

	// **A replica with a remote is opened with it, or not opened at all.** Writing through a
	// connection that cannot push is the failure this whole file was rewritten for: the rows appear,
	// the script reports success, and the next pull rewinds them. Refusing costs a run and is the
	// only outcome that cannot lie.
	const authToken = remoteUrl ? await mintWorkspaceToken(workspaceId) : undefined;

	// **A running app holds this file, and the engine says so in an error nobody should have to
	// read twice.** One writer at a time is the whole point of the lock, so the answer is to close
	// the app rather than to force anything.
	const database = await connectSync({
		path,
		url: remoteUrl ?? undefined,
		authToken,
		clientName: 'rentable-dev-scripts'
	}).catch((error: unknown) => {
		if (error instanceof Error && /lock/i.test(error.message)) {
			throw new Error(
				`${basename(path)} is open in another process — the running app, almost certainly. ` +
					`close it and run this again.`
			);
		}

		throw error;
	});

	// **Before writing, not after.** A seed that starts from a stale base writes rows the push then
	// has to reconcile against changes it never saw; starting from what the server holds makes the
	// push a fast-forward. It also fails here, before five thousand rows, when the token is wrong.
	if (remoteUrl) {
		await database.pull();
	}
	const cache = new Map<string, Awaited<ReturnType<typeof database.prepare>>>();

	const prepare = async (sql: string) => {
		const held = cache.get(sql);

		if (held) {
			return held;
		}

		const statement = await database.prepare(sql);
		cache.set(sql, statement);

		return statement;
	};

	const execute: Execute = async (sql, params, method) => {
		const statement = await prepare(sql);

		if (method === 'run') {
			await statement.run(params);

			return { rows: [] };
		}

		statement.raw(true);

		if (method === 'get') {
			return { rows: ((await statement.get(params)) as unknown[]) ?? [] };
		}

		return { rows: (await statement.all(params)) as unknown[] };
	};

	return {
		path,
		kind: 'workspace',
		db: drizzle(execute, { schema: s }),
		begin: () => database.exec('BEGIN'),
		commit: () => database.exec('COMMIT'),
		rollback: () => database.exec('ROLLBACK'),
		push: async () => {
			if (!remoteUrl) {
				return;
			}

			await database.push();
		},
		close: () => database.close()
	};
}

/**
 * Run one write pass, and leave nothing behind if it fails part-way.
 *
 * The seed is one transaction on purpose: two of its columns are UNIQUE, and a repeat has to abort
 * the run rather than leave half a workspace behind.
 *
 * **The push is part of the write, not a step after it.** A committed transaction on a replica is
 * local until the server has it, and local is what the next pull discards — so a caller that
 * committed and stopped would have written something with a fuse on it. The failure is loud for the
 * same reason: rows that are on this machine and nowhere else are going to disappear, and the person
 * who ran this is the only one who can do anything about it.
 */
export async function write(target: Target, pass: (target: Target) => Promise<void>) {
	await target.begin();

	try {
		try {
			await pass(target);
			await target.commit();
		} catch (error) {
			// only the transaction is rolled back here. A push that fails is past this point and has
			// nothing to undo — the rows are committed locally and the problem is that they are only
			// there, which is what the message below says instead of pretending to clean up.
			await target.rollback().catch(() => {});

			throw error;
		}

		try {
			await target.push();
		} catch (error) {
			throw new Error(
				'the write committed locally but could not be sent to the hosted workspace, so it will ' +
					'be reverted the next time the app syncs.',
				{ cause: error }
			);
		}
	} finally {
		await target.close();
	}
}
