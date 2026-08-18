import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import BetterSqlite3 from 'better-sqlite3';

import type { Database } from '$lib/api/context';
import { createDatabase, type Method, type Row } from './client';

const MIGRATIONS_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../tauri/migrations'
);

function applyMigrations(sqlite: BetterSqlite3.Database) {
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
 * @param onStatement called with every statement that reaches the engine, in order. It exists
 * so a test can assert what a procedure *costs* rather than only what it leaves behind: a bulk
 * action that reconciles once and one that reconciles per record end in the same state, and the
 * difference between them is a round trip per record the moment there is a wire here.
 */
export function createMemoryDatabase(onStatement?: (sql: string) => void): Database {
	const sqlite = new BetterSqlite3(':memory:');
	applyMigrations(sqlite);
	const record = (sql: string) => onStatement?.(sql);

	return createDatabase(
		async (sql, params, method) => {
			record(sql);

			return execute(sqlite, sql, params, method);
		},
		async (queries) =>
			sqlite.transaction(() =>
				queries.map((query) => {
					record(query.sql);

					return execute(sqlite, query.sql, query.params, query.method);
				})
			)()
	);
}
