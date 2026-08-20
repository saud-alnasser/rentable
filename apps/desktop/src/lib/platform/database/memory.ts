import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workspaceMigrationsFolder } from '@rentable/workspace-migrations';
import BetterSqlite3 from 'better-sqlite3';

import type { Database } from '$lib/api/context';
import { createDatabase, type Method, type Row } from './client';

// The package, not `tauri/migrations/` — that directory is generated from this one by
// `tauri/build.rs`, so reading it here would make a test depend on a cargo build having run.
const MIGRATIONS_DIR = fileURLToPath(workspaceMigrationsFolder);

function applyMigrations(sqlite: BetterSqlite3.Database) {
	// a database opened a second time already has them, and the generated migrations create
	// tables unconditionally — so running them again on an existing file is an error rather
	// than a no-op. Reopening one is the whole point of the file-backed client below.
	const built = sqlite
		.prepare("select count(*) as tables from sqlite_master where type = 'table'")
		.get() as { tables: number };

	if (built.tables > 0) {
		return;
	}

	const files = readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith('.sql'))
		.sort();

	for (const file of files) {
		sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
	}
}

/**
 * runs one statement against the in-memory engine and returns its rows in the exact
 * shape the Rust proxy produces, so the production row mapping runs over them unchanged.
 */
function execute(
	sqlite: BetterSqlite3.Database,
	sql: string,
	params: unknown[],
	method: Method
): Row[] {
	const statement = sqlite.prepare(sql);
	const bound = params.map((param) => (typeof param === 'boolean' ? Number(param) : param));

	if (method === 'run') {
		statement.run(...bound);
		return [];
	}

	const columns = statement.columns().map((column) => column.name);
	const rows = statement.raw().all(...bound) as unknown[][];

	return rows.map((values) => ({
		columns,
		// the Rust proxy base64-encodes blobs; match it so the row shape is identical
		rows: values.map((value) => (Buffer.isBuffer(value) ? value.toString('base64') : value))
	}));
}

/**
 * builds a fresh in-memory database client, type-identical to production, backed by a
 * real SQLite database built from the project's migrations. the proxy driver runs over
 * the in-memory engine through the same row mapping as the app, batches inside a
 * transaction as the Rust layer does, and is meant for tests only.
 *
 * @param onStatement called with every statement that reaches the engine, in order, and with
 * how many rows it answered with. It exists so a test can assert what a procedure *costs* rather
 * than only what it leaves behind: a bulk action that reconciles once and one that reconciles per
 * record end in the same state, and the difference between them is a round trip per record the
 * moment there is a wire here. The row count is the other half of that — a list that reads the
 * whole table and a list that reads what it shows issue the same one statement, and differ only
 * in how much crosses back.
 */
export function createMemoryDatabase(
	onStatement?: (sql: string, rowCount: number) => void
): Database {
	return createFileDatabase(':memory:', onStatement);
}

/**
 * The same client over a database that is a real file, so a test can close it and open it
 * again.
 *
 * It exists for the one criterion an in-memory database cannot cover: a durable history is
 * durable or it is not, and the only way to tell is to stop reading the connection that wrote
 * it. Everything else about it is `createMemoryDatabase`'s — same migrations, same row mapping,
 * same transaction batching.
 */
export function createFileDatabase(
	path: string,
	onStatement?: (sql: string, rowCount: number) => void
): Database {
	const sqlite = new BetterSqlite3(path);
	applyMigrations(sqlite);
	const record = (sql: string, rowCount: number) => onStatement?.(sql, rowCount);
	const client = buildClient(sqlite, record);

	openHandles.set(client, sqlite);

	return client;
}

/**
 * the engine behind each client, so a test can let go of the file.
 *
 * Weak, so forgetting to close one costs nothing: a test that never calls {@link
 * closeFileDatabase} leaks a handle until the process ends, which is the behaviour every other
 * test here already has.
 */
const openHandles = new WeakMap<Database, BetterSqlite3.Database>();

/**
 * Release the file a client is holding.
 *
 * Windows refuses to remove a file that is still open, so a test that writes to a temporary
 * directory and tidies up afterwards has to close before it deletes.
 */
export function closeFileDatabase(db: Database) {
	openHandles.get(db)?.close();
	openHandles.delete(db);
}

// Runs one statement and logs it with what it answered with. A statement that throws is logged
// too, with no rows: the log is what reached the engine, and a failure is part of that.
function runRecorded(
	sqlite: BetterSqlite3.Database,
	record: (sql: string, rowCount: number) => void,
	sql: string,
	params: unknown[],
	method: Method
): Row[] {
	try {
		const answered = execute(sqlite, sql, params, method);

		record(sql, answered.length);

		return answered;
	} catch (error) {
		record(sql, 0);

		throw error;
	}
}

function buildClient(
	sqlite: BetterSqlite3.Database,
	record: (sql: string, rowCount: number) => void
): Database {
	return createDatabase(
		async (sql, params, method) => runRecorded(sqlite, record, sql, params, method),
		async (queries) =>
			sqlite.transaction(() =>
				queries.map((query) => runRecorded(sqlite, record, query.sql, query.params, query.method))
			)()
	);
}
