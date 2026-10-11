import initSqlJs, { type Database as Engine, type SqlValue } from 'sql.js';
import wasm from 'sql.js/dist/sql-wasm.wasm?url';
import migrations from 'virtual:stage-migrations';

import type { Database } from '$lib/api/context';
import { createDatabase, type Method, type Query, type Row } from '$lib/platform/database/client';

/**
 * The staged workspace: an in-memory SQLite engine in the window, built from the same migrations
 * the real one is, and gone when the window reloads.
 *
 * It answers in the Rust proxy's row shape, as `platform/database/memory.ts` does for the tests, so
 * the application's own row mapping runs over it unchanged. Nothing here can reach a file: sql.js
 * has no filesystem behind it in a browser.
 */
export type StagedDatabase = {
	/** a drizzle client over the engine, for writing the mock records and a state's changes. */
	db: Database;
	/** one statement, as the database plugin answers one. */
	single: (sql: string, params: unknown[], method?: Method) => Row[];
	/** a batch in one transaction, as the database plugin answers one. */
	batch: (queries: Query[]) => Row[][];
};

export async function openStagedDatabase(): Promise<StagedDatabase> {
	const SQL = await initSqlJs({ locateFile: () => wasm });
	const engine = new SQL.Database();

	for (const migration of migrations) {
		engine.exec(migration);
	}

	const single = (sql: string, params: unknown[]) => execute(engine, sql, params);

	const batch = (queries: Query[]) => {
		engine.exec('begin');

		try {
			const results = queries.map((query) => execute(engine, query.sql, query.params));
			engine.exec('commit');

			return results;
		} catch (error) {
			engine.exec('rollback');
			throw error;
		}
	};

	const db = createDatabase(
		async (sql, params) => single(sql, params),
		async (queries) => batch(queries)
	);

	return { db, single, batch };
}

function execute(engine: Engine, sql: string, params: unknown[]): Row[] {
	const statement = engine.prepare(sql);

	try {
		statement.bind(params.map(bindable));

		const columns = statement.getColumnNames();
		const rows: Row[] = [];

		while (statement.step()) {
			rows.push({ columns, rows: statement.get().map(readable) });
		}

		return rows;
	} finally {
		statement.free();
	}
}

const bindable = (value: unknown): SqlValue => {
	if (typeof value === 'boolean') return Number(value);
	if (value === undefined) return null;

	return value as SqlValue;
};

// the Rust proxy base64-encodes blobs; match it so the row shape is identical.
const readable = (value: SqlValue) =>
	value instanceof Uint8Array ? btoa(String.fromCharCode(...value)) : value;
