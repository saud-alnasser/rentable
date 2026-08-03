import { invoke } from '@tauri-apps/api/core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import * as schema from './schema';

export type Method = 'run' | 'all' | 'values' | 'get';

export type Query = {
	sql: string;
	params: unknown[];
	method: Method;
};

/**
 * one result row in the shape the Rust proxy returns: the column names, and this row's
 * values (numbers, strings, or null; booleans and blobs are already encoded upstream).
 */
export type Row = {
	columns: string[];
	rows: unknown[];
};

/**
 * a transport carries a query to the SQLite engine and returns its raw rows. production
 * uses the Tauri `invoke` commands; tests use an in-memory shim (see `./memory`).
 */
export type SingleTransport = (sql: string, params: unknown[], method: Method) => Promise<Row[]>;
export type BatchTransport = (queries: Query[]) => Promise<Row[][]>;

/**
 * reshapes the Rust proxy's rows into what the drizzle sqlite-proxy driver expects: a
 * single row's values for `get`, an array of rows otherwise. shared by every transport
 * so the language-boundary mapping is exercised rather than bypassed.
 */
export function mapRows(rows: Row[], method: Method) {
	if (rows.length === 0 && method === 'get') {
		return {} as { rows: [] };
	}

	return { rows: method === 'get' ? rows[0].rows : rows.map((r) => r.rows) };
}

/**
 * builds a drizzle client over a transport. every client — production and test — is the
 * same `SqliteRemoteDatabase<typeof schema>` type and runs the same row mapping.
 */
export function createDatabase(single: SingleTransport, batch: BatchTransport) {
	return drizzle(
		async (sql, params, method) => mapRows(await single(sql, params, method), method),
		async (queries: Query[]) => {
			const results = await batch(queries);
			return results.map((rows, index) => mapRows(rows, queries[index].method));
		},
		{
			schema,
			logger: import.meta.env?.DEV
		}
	);
}

export const db = createDatabase(
	// tauri command called directly for fast queries instead of wrapped in the tauri facade
	async (sql, params) => invoke<Row[]>('db_execute_single_sql', { query: { sql, params } }),
	async (queries) => invoke<Row[][]>('db_execute_batch_sql', { queries })
);
