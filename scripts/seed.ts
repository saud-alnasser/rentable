import { faker } from '@faker-js/faker';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Randexp from 'randexp';
import * as s from '../src/lib/api/database/schema';
import { regex } from '../src/lib/api/regex';

dotenv.config();

const counts = {
	tenants: 5000,
	complexes: 10,
	unitsPerComplex: () => Math.floor(Math.random() * 20), // 0 - 20 units per complex
	contractsPerTenant: () => Math.floor(Math.random() * 3), // 0-2 contracts per tenant
	paymentsPerContract: () => Math.floor(Math.random() * 12) // 0-12 payments
};

const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', ''));
const db = drizzle({ client: sqlite });

const seed = async () => {
	db.transaction((tx) => {
		const nationalIdGen = new Randexp(regex.iqama);
		const phoneGen = new Randexp(regex.phone);

		const tenantIds: number[] = [];
		const complexIds: number[] = [];
		const unitIdsPerComplex: Record<number, number[]> = {};

		// ️tenants
		for (let i = 0; i < counts.tenants; i++) {
			const tenantInsert = tx
				.insert(s.tenant)
				.values({
					name: faker.person.fullName(),
					nationalId: nationalIdGen.gen(),
					phone: phoneGen.gen()
				})
				.returning()
				.get();

			tenantIds.push(tenantInsert.id);
		}

		// ️complexes & units
		for (let i = 0; i < counts.complexes; i++) {
			const complexInsert = tx
				.insert(s.complex)
				.values({
					name: faker.location.street(),
					location: faker.location.streetAddress()
				})
				.returning()
				.get();

			const complexId = complexInsert.id;
			complexIds.push(complexId);

			unitIdsPerComplex[complexId] = [];

			const unitsCount = counts.unitsPerComplex();

			for (let j = 0; j < unitsCount; j++) {
				const unitInsert = tx
					.insert(s.unit)
					.values({
						name: `Room ${j + 1}`,
						status: 'vacant',
						complexId
					})
					.returning()
					.get();

				unitIdsPerComplex[complexId].push(unitInsert.id);
			}
		}

		// ️contracts & payments
		const contractStatuses: s.Contract['status'][] = [
			'active',
			'terminated',
			'expired',
			'defaulted'
		];

		const intervalOptions: s.Contract['interval'][] = ['1m', '3m', '6m', '12m'];

		for (const tenantId of tenantIds) {
			const contractsCount = counts.contractsPerTenant();

			for (let c = 0; c < contractsCount; c++) {
				// pick a random complex & unit(s)
				const complexId = faker.helpers.arrayElement(complexIds);
				const units = unitIdsPerComplex[complexId];
				if (!units.length) continue;

				const contractUnitCount = Math.min(2, units.length);
				const selectedUnitIds = faker.helpers.arrayElements(units, contractUnitCount);
				// gov id
				const govId = faker.string.uuid();

				// contract dates
				const start = faker.date.past({ years: 2 });
				const durationMonths = faker.number.int({ min: 1, max: 24 });
				const end = new Date(start.getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000);

				// contract status
				const status = faker.helpers.arrayElement(contractStatuses);

				// cost & interval
				const cost = faker.number.int({ min: 500, max: 5000 });
				const interval = faker.helpers.arrayElement(intervalOptions);

				const contractInsert = tx
					.insert(s.contract)
					.values({
						govId,
						status,
						start,
						end,
						interval,
						cost,
						tenantId
					})
					.returning()
					.get();

				const contractId = contractInsert.id;

				// contract units & unit status
				for (const unitId of selectedUnitIds) {
					tx.insert(s.contractUnit)
						.values({
							contractId,
							unitId
						})
						.execute();

					// set unit status based on contract status
					const unitStatus: s.Unit['status'] = status === 'active' ? 'occupied' : 'vacant';
					tx.update(s.unit).set({ status: unitStatus }).where(eq(s.unit.id, unitId)).execute();
				}

				// payments (only for active or defaulted contracts)
				if (status === 'active' || status === 'defaulted') {
					const paymentsCount = counts.paymentsPerContract();
					const intervalMs = 30 * 24 * 60 * 60 * 1000; // monthly

					for (let p = 0; p < paymentsCount; p++) {
						tx.insert(s.payment)
							.values({
								contractId,
								amount: cost,
								date: new Date(start.getTime() + intervalMs * p)
							})
							.execute();
					}
				}
			}
		}
	});
};

seed()
	.then(() =>
		console.log('database seeded with tenants, complexes, units, contracts, and payments')
	)
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
