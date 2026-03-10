import { faker } from '@faker-js/faker';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Randexp from 'randexp';
import * as s from '../src/lib/api/database/schema';
import { regex } from '../src/lib/api/regex';
import {
	deriveContractStatus,
	deriveUnitStatus,
	getExpectedAmountBy,
	getIntervalDays,
	getIntervalMonths
} from '../src/lib/api/utils/contract-status';

dotenv.config();

const counts = {
	tenants: 5000,
	complexes: 10,
	unitsPerComplex: () => Math.floor(Math.random() * 20), // 0 - 20 units per complex
	contractsPerTenant: () => Math.floor(Math.random() * 3) // 0-2 contracts per tenant
};

const contractStatuses: s.Contract['status'][] = [
	'active',
	'terminated',
	'fulfilled',
	'expired',
	'defaulted',
	'scheduled'
];

const intervalOptions: s.Contract['interval'][] = ['1m', '3m', '6m', '12m'];

type SeedPayment = {
	amount: number;
	date: Date;
};

type SeedContract = {
	status: s.Contract['status'];
	start: Date;
	end: Date;
	interval: s.Contract['interval'];
	cost: number;
};

type SeedAssignment = {
	contract: SeedContract;
	payments: SeedPayment[];
};

type UnitSchedule = {
	start: Date;
	end: Date;
	status: s.Contract['status'];
};

function toUtcDay(value: Date | number = Date.now()) {
	const date = value instanceof Date ? value : new Date(value);

	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcMonth(monthOffset = 0, now = Date.now()) {
	const today = toUtcDay(now);

	return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
}

function addUtcDays(value: Date, days: number) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

function getContractEnd(start: Date, interval: s.Contract['interval'], cycleCount: number) {
	return addUtcDays(start, getIntervalDays(interval) * cycleCount - 1);
}

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
	return (
		toUtcDay(startA).getTime() <= toUtcDay(endB).getTime() &&
		toUtcDay(startB).getTime() <= toUtcDay(endA).getTime()
	);
}

function getPaymentDates(start: Date, interval: s.Contract['interval'], count: number) {
	const intervalDays = getIntervalDays(interval);

	return Array.from({ length: count }, (_, index) => addUtcDays(start, intervalDays * index));
}

function buildContractSeed(
	targetStatus: s.Contract['status'],
	interval: s.Contract['interval'],
	cost: number,
	now = Date.now()
) {
	const cycleCount = faker.number.int({ min: 1, max: targetStatus === 'terminated' ? 4 : 5 });
	let start = startOfUtcMonth(0, now);

	switch (targetStatus) {
		case 'scheduled':
			start = startOfUtcMonth(faker.number.int({ min: 1, max: 6 }), now);
			break;
		case 'active':
		case 'fulfilled': {
			const pastCycles = faker.number.int({ min: 0, max: Math.min(cycleCount - 1, 2) });
			start = startOfUtcMonth(-pastCycles * getIntervalMonths(interval), now);
			break;
		}
		case 'expired':
		case 'defaulted':
			start = startOfUtcMonth(
				-(cycleCount + faker.number.int({ min: 1, max: 2 })) * getIntervalMonths(interval),
				now
			);
			break;
		case 'terminated':
			start = startOfUtcMonth(-faker.number.int({ min: 0, max: 8 }), now);
			break;
	}

	const end = getContractEnd(start, interval, cycleCount);
	const baseContract = {
		status: targetStatus === 'terminated' ? 'terminated' : 'active',
		start,
		end,
		interval,
		cost
	} satisfies SeedContract;
	const totalExpectedAmount = cycleCount * cost;
	const dueNowAmount = getExpectedAmountBy(baseContract, now);
	let payments: SeedPayment[] = [];

	switch (targetStatus) {
		case 'scheduled':
			payments = [];
			break;
		case 'active':
			if (dueNowAmount > cost) {
				payments = getPaymentDates(start, interval, Math.max(dueNowAmount / cost - 1, 0)).map(
					(date) => ({
						amount: cost,
						date
					})
				);
			} else {
				payments = [{ amount: Math.round(cost * 0.5 * 100) / 100, date: start }];
			}
			break;
		case 'fulfilled':
			payments = [{ amount: totalExpectedAmount, date: start }];
			break;
		case 'expired':
			payments = [{ amount: totalExpectedAmount, date: end }];
			break;
		case 'defaulted': {
			const paidCycles = cycleCount > 1 ? faker.number.int({ min: 0, max: cycleCount - 1 }) : 0;

			payments =
				paidCycles > 0
					? getPaymentDates(start, interval, paidCycles).map((date) => ({ amount: cost, date }))
					: [{ amount: Math.round(cost * 0.5 * 100) / 100, date: start }];
			break;
		}
		case 'terminated':
			payments = faker.datatype.boolean()
				? [{ amount: Math.round(cost * 0.5 * 100) / 100, date: start }]
				: [];
			break;
	}

	return {
		start,
		end,
		status:
			targetStatus === 'terminated'
				? ('terminated' satisfies s.Contract['status'])
				: deriveContractStatus(baseContract, payments, now),
		payments
	};
}

function getAvailableUnitIds(
	unitIds: number[],
	unitSchedules: Map<number, UnitSchedule[]>,
	targetStatus: s.Contract['status'],
	start: Date,
	end: Date
) {
	if (targetStatus === 'terminated') {
		return unitIds;
	}

	return unitIds.filter((unitId) =>
		(unitSchedules.get(unitId) ?? []).every(
			(schedule) =>
				schedule.status === 'terminated' || !rangesOverlap(schedule.start, schedule.end, start, end)
		)
	);
}

const sqlite = new Database(process.env.DATABASE_URL?.replace('file:', ''));
const db = drizzle({ client: sqlite });

const seed = async () => {
	db.transaction((tx) => {
		const now = Date.now();
		const nationalIdGen = new Randexp(regex.iqama);
		const phoneGen = new Randexp(regex.phone);

		const tenantIds: number[] = [];
		const complexIds: number[] = [];
		const unitIdsPerComplex: Record<number, number[]> = {};
		const unitSchedules = new Map<number, UnitSchedule[]>();
		const unitAssignments = new Map<number, SeedAssignment[]>();

		// ️tenants
		for (let i = 0; i < counts.tenants; i++) {
			const name = faker.person.fullName();
			const tenantInsert = tx
				.insert(s.tenant)
				.values({
					name,
					nationalId: nationalIdGen.gen(),
					phone: phoneGen.gen()
				})
				.returning()
				.get();

			tenantIds.push(tenantInsert.id);
		}

		// ️complexes & units
		for (let i = 0; i < counts.complexes; i++) {
			const name = faker.location.street();
			const complexInsert = tx
				.insert(s.complex)
				.values({
					name,
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
				unitSchedules.set(unitInsert.id, []);
				unitAssignments.set(unitInsert.id, []);
			}
		}

		// ️contracts & payments
		for (const tenantId of tenantIds) {
			const contractsCount = counts.contractsPerTenant();

			for (let c = 0; c < contractsCount; c++) {
				const complexId = faker.helpers.arrayElement(complexIds);
				const units = unitIdsPerComplex[complexId] ?? [];

				if (!units.length) {
					continue;
				}

				const govId = faker.string.uuid();
				const targetStatus = faker.helpers.arrayElement(contractStatuses);
				const cost = faker.number.int({ min: 500, max: 5000 });
				const interval = faker.helpers.arrayElement(intervalOptions);
				const seededContract = buildContractSeed(targetStatus, interval, cost, now);
				const availableUnitIds = getAvailableUnitIds(
					units,
					unitSchedules,
					seededContract.status,
					seededContract.start,
					seededContract.end
				);

				if (!availableUnitIds.length) {
					continue;
				}

				const contractUnitCount = faker.number.int({
					min: 1,
					max: Math.min(2, availableUnitIds.length)
				});
				const selectedUnitIds = faker.helpers.arrayElements(availableUnitIds, contractUnitCount);

				const contractInsert = tx
					.insert(s.contract)
					.values({
						govId,
						status: seededContract.status,
						start: seededContract.start,
						end: seededContract.end,
						interval,
						cost,
						tenantId
					})
					.returning()
					.get();

				const contractId = contractInsert.id;

				for (const unitId of selectedUnitIds) {
					tx.insert(s.contractUnit)
						.values({
							contractId,
							unitId
						})
						.execute();

					unitSchedules.set(unitId, [
						...(unitSchedules.get(unitId) ?? []),
						{
							start: seededContract.start,
							end: seededContract.end,
							status: seededContract.status
						}
					]);
					unitAssignments.set(unitId, [
						...(unitAssignments.get(unitId) ?? []),
						{
							contract: {
								status: seededContract.status,
								start: seededContract.start,
								end: seededContract.end,
								interval,
								cost
							},
							payments: seededContract.payments.map((payment) => ({
								amount: payment.amount,
								date: payment.date
							}))
						}
					]);
				}

				for (const payment of seededContract.payments) {
					tx.insert(s.payment)
						.values({
							contractId,
							amount: payment.amount,
							date: payment.date
						})
						.execute();
				}
			}
		}

		for (const unitIds of Object.values(unitIdsPerComplex)) {
			for (const unitId of unitIds) {
				const status = deriveUnitStatus(unitAssignments.get(unitId) ?? [], now);

				tx.update(s.unit).set({ status }).where(eq(s.unit.id, unitId)).execute();
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
