import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as s from '../src/lib/api/database/schema';

const sqlite = new Database('./tauri/app.db');
const db = drizzle({ client: sqlite });

const purge = async () => {
	db.transaction((tx) => {
		tx.delete(s.tenant).execute();
	});
};

purge()
	.then(() => console.log('purged database'))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
