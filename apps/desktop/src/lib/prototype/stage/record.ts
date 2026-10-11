import { fakerAR, fakerEN, type Faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import Randexp from 'randexp';

import type { Database } from '$lib/api/context';
import { deriveContractStatus } from '$lib/contract/contract';
import { deriveUnitStatus } from '$lib/contract/assignment/assignment';
import {
	getContractCycleStartDate,
	getContractEndDateForCycles
} from '$lib/contract/schedule/cycle';
import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { identity, phone } from '$lib/tenant/tenant';

/**
 * The kinds of contract the interface draws differently, each written at least twice so every
 * list, rank and badge has something in it. `renewed` is a pair: a contract in its notice window
 * and the one that continues it from the next day.
 */
export const CONTRACT_KINDS = [
	'paid',
	'overdue',
	'ending',
	'renewed',
	'scheduled',
	'fulfilled',
	'expired',
	'defaulted',
	'terminated'
] as const;

export type ContractKind = (typeof CONTRACT_KINDS)[number];

type Shape = {
	interval: s.Contract['interval'];
	/** the month the contract starts in, from this one. */
	from: number;
	cycles: number;
	/** how many of the cycles started by today are paid; `all` pays every cycle, started or not. */
	paid: number | 'due' | 'all';
};

const SHAPES: Record<Exclude<ContractKind, 'renewed'>, Shape> = {
	paid: { interval: '1m', from: -4, cycles: 12, paid: 'due' },
	overdue: { interval: '1m', from: -5, cycles: 12, paid: 2 },
	ending: { interval: '3m', from: -10, cycles: 4, paid: 'due' },
	scheduled: { interval: '6m', from: 2, cycles: 2, paid: 0 },
	fulfilled: { interval: '12m', from: -1, cycles: 1, paid: 'all' },
	expired: { interval: '6m', from: -14, cycles: 2, paid: 'all' },
	defaulted: { interval: '3m', from: -15, cycles: 4, paid: 2 },
	terminated: { interval: '1m', from: -3, cycles: 12, paid: 1 }
};

const DAY = 24 * 60 * 60 * 1000;

const monthStart = (offset: number, now: number) => {
	const today = new Date(now);

	return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
};

/**
 * Write a workspace of records shaped like a real one: four complexes of units, tenants with real
 * looking names, national ids and phones, a contract of every kind the interface draws, and the
 * payments each would have by today.
 *
 * **Deterministic.** The same language writes the same records every time, so a state looks the
 * same each time it is entered and a screenshot can be compared with the last. **Names follow the
 * language staged**, since a workspace run in Arabic is typed in Arabic.
 */
export async function writeRecords(db: Database, language: 'ar' | 'en', now = Date.now()) {
	const faker = language === 'ar' ? fakerAR : fakerEN;
	faker.seed(861);

	const nationalIds = generator(identity, faker);
	const phones = generator(phone, faker);
	const unitWord = language === 'ar' ? 'شقة' : 'Unit';

	const units: { id: string; complexId: string }[] = [];

	for (let c = 0; c < 4; c++) {
		const complexId = newId();

		await db.insert(s.complex).values({
			id: complexId,
			name: `${faker.location.street()} ${c + 1}`,
			location: `${faker.location.city()}, ${faker.location.streetAddress()}`
		});

		for (let u = 0; u < 10; u++) {
			const id = newId();
			await db
				.insert(s.unit)
				.values({ id, name: `${unitWord} ${c + 1}0${u}`, status: 'vacant', complexId });
			units.push({ id, complexId });
		}
	}

	const assignments = new Map<string, Parameters<typeof deriveUnitStatus>[0]>();
	const usedPhones = new Set<string>();
	let nextUnit = 0;

	for (let t = 0; t < 30; t++) {
		let tenantPhone = phones();
		while (usedPhones.has(tenantPhone)) tenantPhone = phones();
		usedPhones.add(tenantPhone);

		const tenantId = newId();
		await db.insert(s.tenant).values({
			id: tenantId,
			name: faker.person.fullName(),
			nationalId: nationalIds(),
			phone: tenantPhone
		});

		// the last few tenants hold no contract, as a real workspace's newest tenants do.
		if (t >= CONTRACT_KINDS.length * 3) continue;

		const kind = CONTRACT_KINDS[t % CONTRACT_KINDS.length];
		const unit = units[nextUnit++ % units.length];
		const cost = faker.number.int({ min: 30, max: 120 }) * 50;

		const first = await writeContract(db, faker, {
			kind: kind === 'renewed' ? 'ending' : kind,
			tenantId,
			unitId: unit.id,
			cost,
			now
		});
		note(assignments, unit.id, first);

		if (kind === 'renewed') {
			const start = new Date(first.contract.end.getTime() + DAY);
			const successor = await writeContract(db, faker, {
				kind: 'scheduled',
				tenantId,
				unitId: unit.id,
				cost: cost + 250,
				now,
				start,
				renews: first.id
			});
			note(assignments, unit.id, successor);
		}
	}

	for (const { id } of units) {
		await db
			.update(s.unit)
			.set({ status: deriveUnitStatus(assignments.get(id) ?? [], now) })
			.where(eq(s.unit.id, id));
	}
}

type Written = {
	id: string;
	contract: {
		status: s.Contract['status'];
		start: Date;
		end: Date;
		interval: s.Contract['interval'];
		cost: number;
	};
	payments: { amount: number; date: Date }[];
};

async function writeContract(
	db: Database,
	faker: Faker,
	{
		kind,
		tenantId,
		unitId,
		cost,
		now,
		start,
		renews
	}: {
		kind: Exclude<ContractKind, 'renewed'>;
		tenantId: string;
		unitId: string;
		cost: number;
		now: number;
		start?: Date;
		renews?: string;
	}
): Promise<Written> {
	const shape = SHAPES[kind];
	const begins = start ?? monthStart(shape.from, now);
	const end = getContractEndDateForCycles(begins, shape.interval, shape.cycles) ?? begins;
	const cycleStarts = Array.from({ length: shape.cycles }, (_, index) =>
		getContractCycleStartDate(begins, shape.interval, index)
	);
	const started = cycleStarts.filter((date) => date.getTime() <= now);
	const paidCycles =
		shape.paid === 'all'
			? cycleStarts
			: shape.paid === 'due'
				? started
				: started.slice(0, shape.paid);
	const payments = paidCycles.map((date) => ({
		amount: cost,
		date: new Date(date.getTime() + 2 * DAY)
	}));
	const base = { status: 'active' as const, start: begins, end, interval: shape.interval, cost };
	const status: s.Contract['status'] =
		kind === 'terminated' ? 'terminated' : deriveContractStatus(base, payments, now);

	const id = newId();
	await db.insert(s.contract).values({
		id,
		govId: faker.string.numeric(10),
		status,
		start: begins,
		end,
		interval: shape.interval,
		cost,
		tenantId,
		renewsContractId: renews ?? null
	});
	await db.insert(s.contractUnit).values({ contractId: id, unitId });

	for (const payment of payments) {
		await db.insert(s.payment).values({
			id: newId(),
			contractId: id,
			amount: payment.amount,
			date: payment.date,
			method: faker.helpers.arrayElement(s.PAYMENT_METHODS)
		});
	}

	return { id, contract: { ...base, status }, payments };
}

function note(
	assignments: Map<string, Parameters<typeof deriveUnitStatus>[0]>,
	unitId: string,
	written: Written
) {
	assignments.set(unitId, [
		...(assignments.get(unitId) ?? []),
		{ contract: written.contract, payments: written.payments }
	]);
}

/** a generator of strings matching `pattern`, drawing from `faker` so it repeats with the seed. */
function generator(pattern: RegExp, faker: Faker) {
	const randexp = new Randexp(pattern);
	randexp.randInt = (from: number, to: number) => faker.number.int({ min: from, max: to });

	return () => randexp.gen();
}
