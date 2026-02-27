import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as s from '../src/lib/api/database/schema';

dotenv.config();

const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', ''));
const db = drizzle({ client: sqlite });

const purge = async () => {
	db.transaction((tx) => {
		tx.delete(s.tenant).execute();
		tx.delete(s.complex).execute();
		tx.delete(s.contractUnit).execute();
		tx.delete(s.unit).execute();
		tx.delete(s.contract).execute();
		tx.delete(s.payment).execute();
	});
};

purge()
	.then(() => console.log('purged database'))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
