import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import Randexp from 'randexp';
import {
	deriveContractStatus,
	deriveUnitStatus,
	getContractCycleStartDate,
	getContractEndDateForCycles,
	getExpectedAmountBy,
	getIntervalMonths
} from '../src/lib/contract/contract';
import { newId } from '../src/lib/platform/database/identity';
import * as s from '../src/lib/platform/database/schema';
import { identity, phone } from '../src/lib/tenant/tenant';
import { openWorkspaceDatabase, write } from './database';

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

function getContractEnd(start: Date, interval: s.Contract['interval'], cycleCount: number) {
	return getContractEndDateForCycles(start, interval, cycleCount) ?? start;
}

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
	return (
		toUtcDay(startA).getTime() <= toUtcDay(endB).getTime() &&
		toUtcDay(startB).getTime() <= toUtcDay(endA).getTime()
	);
}

function getPaymentDates(start: Date, interval: s.Contract['interval'], count: number) {
	return Array.from({ length: count }, (_, index) =>
		getContractCycleStartDate(start, interval, index)
	);
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
	unitIds: string[],
	unitSchedules: Map<string, UnitSchedule[]>,
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

/**
 * Fill this machine's workspace with a plausible year of records.
 *
 * **Which file that is, is `./database`'s to answer and no longer this script's to assume.** It
 * used to open `DATABASE_URL` directly, which stopped being the file the application opens the day
 * a workspace became a replica.
 *
 * **Every statement is awaited now**, because a replica is reached through an async engine. The
 * generator is unchanged in what it produces; what changed is that it goes through the same proxy
 * contract the application's own client uses, so one body serves both engines.
 */
const seed = async () => {
	const target = await openWorkspaceDatabase();

	await write(target, async ({ db }) => {
		const now = Date.now();
		const nationalIdGen = new Randexp(identity);
		const phoneGen = new Randexp(phone);

		// **Identities are minted here, not handed back by the engine.** Every table's `id` is a
		// TEXT primary key with no default, and `newId` is where one comes from — the same UUIDv7
		// the routers mint, so a seeded row sorts among created ones the way it would have.
		const tenantIds: string[] = [];
		const usedPhones = new Set<string>();
		const complexIds: string[] = [];
		const unitIdsPerComplex: Record<string, string[]> = {};
		const unitSchedules = new Map<string, UnitSchedule[]>();
		const unitAssignments = new Map<string, SeedAssignment[]>();

		// ️tenants
		for (let i = 0; i < counts.tenants; i++) {
			const name = faker.person.fullName();

			// `tenant.phone` is UNIQUE and the whole seed is one transaction, so a single repeat
			// aborts the run and leaves no database at all. The regex admits 90 million numbers —
			// ample to hold `counts.tenants`, far too few to draw them without a repeat by luck.
			let tenantPhone = phoneGen.gen();
			while (usedPhones.has(tenantPhone)) {
				tenantPhone = phoneGen.gen();
			}
			usedPhones.add(tenantPhone);

			const tenantId = newId();

			await db.insert(s.tenant).values({
				id: tenantId,
				name,
				nationalId: nationalIdGen.gen(),
				phone: tenantPhone
			});

			tenantIds.push(tenantId);
		}

		// ️complexes & units
		for (let i = 0; i < counts.complexes; i++) {
			const complexId = newId();

			await db.insert(s.complex).values({
				id: complexId,
				// `complex.name` is UNIQUE and the whole seed is one transaction, so a single
				// repeated street name aborts the run and leaves no database at all. The index
				// carries the guarantee rather than the generator's entropy.
				name: `${faker.location.street()} ${i + 1}`,
				location: faker.location.streetAddress()
			});

			complexIds.push(complexId);

			unitIdsPerComplex[complexId] = [];

			const unitsCount = counts.unitsPerComplex();

			for (let j = 0; j < unitsCount; j++) {
				const unitId = newId();

				await db.insert(s.unit).values({
					id: unitId,
					name: `Room ${j + 1}`,
					status: 'vacant',
					complexId
				});

				unitIdsPerComplex[complexId].push(unitId);
				unitSchedules.set(unitId, []);
				unitAssignments.set(unitId, []);
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

				const contractId = newId();

				await db.insert(s.contract).values({
					id: contractId,
					govId,
					status: seededContract.status,
					start: seededContract.start,
					end: seededContract.end,
					interval,
					cost,
					tenantId
				});

				for (const unitId of selectedUnitIds) {
					await db.insert(s.contractUnit).values({
						contractId,
						unitId
					});

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
					await db.insert(s.payment).values({
						id: newId(),
						contractId,
						amount: payment.amount,
						date: payment.date
					});
				}
			}
		}

		for (const unitIds of Object.values(unitIdsPerComplex)) {
			for (const unitId of unitIds) {
				const status = deriveUnitStatus(unitAssignments.get(unitId) ?? [], now);

				await db.update(s.unit).set({ status }).where(eq(s.unit.id, unitId));
			}
		}
	});

	return target;
};

seed()
	.then((target) =>
		console.log(`seeded ${target.path} with tenants, complexes, units, contracts, and payments`)
	)
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
