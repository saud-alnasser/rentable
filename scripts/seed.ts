import { faker } from '@faker-js/faker';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Randexp from 'randexp';
import * as s from '../src/lib/api/database/schema';
import { regex } from '../src/lib/resources/tenants/utils/regex';

const count = 5000;

const sqlite = new Database('./tauri/app.db');
const db = drizzle({ client: sqlite });

const purge = async () => {
	db.transaction((tx) => {
		tx.delete(s.tenant).execute();
	});
};

const seed = async () => {
	db.transaction((tx) => {
		const nationalId = new Randexp(regex.iqama);
		const phone = new Randexp(regex.phone);

		for (let i = 0; i < count; i++) {
			tx.insert(s.tenant)
				.values({
					nationalId: nationalId.gen(),
					name: faker.person.fullName(),
					phone: phone.gen()
				})
				.execute();
		}
	});
};

seed()
	.then(() => console.log('seeded database'))
	.catch(async (error) => {
		await purge();
		console.error(error);
		process.exit(1);
	});
