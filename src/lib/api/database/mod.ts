import { invoke } from '@tauri-apps/api/core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import * as schema from './schema';

type Method = 'run' | 'all' | 'values' | 'get';

type Query = {
	sql: string;
	params: unknown[];
	method: Method;
};

type Row = {
	columns: string[];
	rows: string[];
};

export const db = drizzle(
	async (sql, params, method) => {
		const rows = await invoke<Row[]>('db_execute_single_sql', { query: { sql, params } });

		/**
		 * response type:
		 * { rows: string[] } for 'get'
		 * { rows: string[][] } for the rest
		 *
		 * more info: https://orm.drizzle.team/docs/connect-drizzle-proxy
		 */
		return map(rows, method);
	},
	async (queries: Query[]) => {
		const batch = await invoke<Row[][]>('db_execute_batch_sql', { queries });

		/**
		 * response type:
		 * { rows: string[] }[] for 'get'
		 * { rows: string[][] }[] for the rest
		 *
		 * more info: https://orm.drizzle.team/docs/connect-drizzle-proxy
		 */
		return batch.map((rows, index) => {
			return map(rows, queries[index].method);
		});
	},
	{
		schema,
		logger: import.meta.env.DEV
	}
);

function map(rows: Row[], method: Method) {
	if (rows.length === 0 && method === 'get') {
		return {} as { rows: [] };
	}

	return { rows: method === 'get' ? rows[0].rows : rows.map((r) => r.rows) };
}
