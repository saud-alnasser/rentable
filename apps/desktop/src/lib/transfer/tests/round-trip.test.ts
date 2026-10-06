import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import type { Database } from '$lib/api/context.ts';
import { type Api, createApi, monthsFromNow, NOW, refusedWith } from '$lib/app/tests/testing.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import * as s from '$lib/platform/database/schema';
import type { ExportSheet } from '$lib/transfer/host.ts';
import { readBack, toTables } from './file.ts';
import {
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toContractReferences,
	toTransferInput,
	toUnitReference,
	type WorkspaceTransfer
} from '../index.ts';

/**
 * EXPORT THEN IMPORT GIVES BACK THE SAME STATE
 *
 * Effort 854, requirement 30 and criterion 30. A workspace holding every record kind and every
 * field a person enters is exported, read back as the file a reader would hand over, imported into
 * an empty workspace, and the two are compared row by row, every column of every table, with each
 * id stood in for by the name a file calls its record by. What is derived on read (a status other
 * than terminated, a unit's status, the paid and expected amounts) is compared too, because it has
 * to come out the same.
 */

/**
 * Three tenants, two complexes with a unit nobody holds, and three contracts:
 *
 * - a numberless one, terminated, whose unit a later contract holds over the same days, with
 *   payments carrying a method, a reference and a note, and a refund taken after the termination;
 * - a numbered one holding two units, paid beyond its cost and refunded the excess while it runs;
 * - a numbered one paid twice the same on one day.
 */
async function seed(api: Api) {
	const omar = await api.tenant.create({
		name: 'عمر الحربي',
		nationalId: '2234567891',
		phone: '+966553456789'
	});
	const sara = await api.tenant.create({
		name: 'Sara Idle',
		nationalId: '1334567892',
		phone: '+966554567890'
	});
	const abby = await api.tenant.create({
		name: 'Abby Kris',
		nationalId: '1234567890',
		phone: '+966512345678'
	});

	const nakheel = await api.complex.create({
		name: 'Al Nakheel',
		location: 'Riyadh',
		units: [{ name: 'A1' }, { name: 'A2' }, { name: 'A3' }]
	});
	const yasmin = await api.complex.create({
		name: 'برج الياسمين',
		location: 'جدة',
		units: [{ name: '101' }]
	});
	const nakheelUnits = await api.complex.units.getMany({ complexId: nakheel.id });
	const [yasminUnit] = await api.complex.units.getMany({ complexId: yasmin.id });
	const named = (name: string) => nakheelUnits.find((unit) => unit.name === name)!.id;

	const ended = await api.contract.create({
		tenantId: omar.id,
		start: monthsFromNow(-6),
		end: monthsFromNow(6),
		interval: '1m',
		cost: 1_000
	});

	await api.contract.units.set({ contractId: ended.id, unitIds: [named('A1')] });
	await api.payment.create({
		contractId: ended.id,
		date: monthsFromNow(-6),
		amount: 1_000,
		method: 'cash',
		note: 'first month'
	});
	await api.payment.create({
		contractId: ended.id,
		date: monthsFromNow(-5),
		amount: 1_000.5,
		method: 'bank-transfer',
		reference: 'TRX-1',
		note: 'second month, with a halala'
	});
	await api.contract.terminate({ id: ended.id });
	await api.payment.create({
		contractId: ended.id,
		date: monthsFromNow(-1),
		amount: 400,
		direction: 'refund',
		method: 'bank-transfer',
		reference: 'R-1',
		note: 'the deposit back'
	});

	const running = await api.contract.create({
		govId: 'GOV-2',
		tenantId: sara.id,
		start: monthsFromNow(-2),
		end: monthsFromNow(10),
		interval: '12m',
		cost: 12_000
	});

	await api.contract.units.set({ contractId: running.id, unitIds: [named('A1'), named('A2')] });
	await api.payment.create({
		contractId: running.id,
		date: monthsFromNow(-2),
		amount: 13_000,
		method: 'cheque',
		reference: 'CHQ-7'
	});
	await api.payment.create({
		contractId: running.id,
		date: monthsFromNow(-1),
		amount: 1_000,
		direction: 'refund',
		method: 'cash',
		note: 'paid twice'
	});
	const idle = await api.contract.create({
		govId: 'GOV-3',
		tenantId: abby.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(2),
		interval: '3m',
		cost: 4_500
	});

	await api.contract.units.set({ contractId: idle.id, unitIds: [yasminUnit.id] });
	// two payments alike in every column: a file read twice is turned away by contract, day and
	// amount, and these two are still two payments.
	await api.payment.create({ contractId: idle.id, date: monthsFromNow(0), amount: 50 });
	await api.payment.create({ contractId: idle.id, date: monthsFromNow(0), amount: 50 });
}

/**
 * A row without the columns named: ids, which no two workspaces share. Every other column stays,
 * so a column added to a table is compared without this file naming it.
 */
function without<T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> {
	const copy = { ...row };

	for (const key of keys) {
		delete copy[key];
	}

	return copy;
}

/**
 * Every table, every column, as rows naming what they point at the way a file does: a tenant by
 * national id, a complex by name, a unit by its reference, a contract by its reference. Sorted, so
 * two workspaces holding the same records in another order compare equal.
 */
async function snapshot(db: Database) {
	const tenants = await db.select().from(s.tenant);
	const complexes = await db.select().from(s.complex);
	const units = await db.select().from(s.unit);
	const contracts = await db.select().from(s.contract);
	const assignments = await db.select().from(s.contractUnit);
	const payments = await db.select().from(s.payment);

	const tenantOf = new Map(tenants.map((tenant) => [tenant.id, tenant.nationalId]));
	const complexOf = new Map(complexes.map((complex) => [complex.id, complex.name]));
	const unitOf = new Map(
		units.map((unit) => [unit.id, toUnitReference(complexOf.get(unit.complexId)!, unit.name)])
	);
	const contractOf = toContractReferences(
		contracts.map((contract) => ({ ...contract, tenant: tenantOf.get(contract.tenantId)! }))
	);
	const sorted = <T>(rows: T[]) =>
		rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

	return {
		tenants: sorted(tenants.map((tenant) => without(tenant, 'id'))),
		complexes: sorted(complexes.map((complex) => without(complex, 'id'))),
		units: sorted(
			units.map((unit) => ({
				...without(unit, 'id', 'complexId'),
				complex: complexOf.get(unit.complexId)
			}))
		),
		contracts: sorted(
			contracts.map(({ id, tenantId, ...contract }) => ({
				...contract,
				reference: contractOf.get(id),
				tenant: tenantOf.get(tenantId),
				units: assignments
					.filter((assignment) => assignment.contractId === id)
					.map((assignment) => unitOf.get(assignment.unitId))
					.sort()
			}))
		),
		payments: sorted(
			payments.map((payment) => ({
				...without(payment, 'id', 'contractId'),
				contract: contractOf.get(payment.contractId)
			}))
		)
	};
}

/** a workspace, exported, read back as a file, and imported into an empty one. */
async function roundTrip(written: WorkspaceTransfer) {
	const db = createMemoryDatabase();
	const target = await createApi({ db });
	const plan = planWorkspaceImport(toTables(written), NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan), 'the file it wrote is a file it can read');

	await target.transfer.importWhole(toTransferInput(plan.transfer));

	return { db, target };
}

test('a workspace exported and imported into an empty one is the same workspace', async () => {
	const db = createMemoryDatabase();
	const source = await createApi({ db });

	await seed(source);

	const before = await snapshot(db);

	// what the fixture is for, stated before the comparison rather than left to it: two
	// workspaces holding no refund, no termination and no method compare equal without the round
	// trip having carried any of them.
	assert.ok(before.contracts.some((contract) => contract.status === 'terminated'));
	assert.ok(before.contracts.some((contract) => contract.govId === null));
	assert.equal(before.payments.filter((payment) => payment.direction === 'refund').length, 2);
	assert.ok(before.payments.every((payment) => payment.amount > 0));
	assert.ok(before.payments.some((payment) => payment.method && payment.reference && payment.note));
	assert.deepEqual(
		before.contracts.filter((contract) => contract.units.includes('Al Nakheel / A1')).length,
		2
	);

	const written = await source.transfer.get();
	const { db: copied, target } = await roundTrip(written);

	const after = await snapshot(copied);

	assert.deepEqual(after.tenants, before.tenants);
	assert.deepEqual(after.complexes, before.complexes);
	assert.deepEqual(after.units, before.units);
	assert.deepEqual(after.contracts, before.contracts);
	assert.deepEqual(after.payments, before.payments);

	// and the file the copy writes is the file the original wrote.
	assert.deepEqual(await target.transfer.get(), written);
});

test('a refund is written to the file as a negative amount, beside its method, reference and note', async () => {
	const source = await createApi();

	await seed(source);

	const [payments] = toTables(await source.transfer.get()).filter(
		(table) => table.name === 'Payments'
	);

	assert.deepEqual(payments.headers, ['Contract', 'Date', 'Amount', 'Method', 'Reference', 'Note']);
	assert.ok(
		payments.rows.some(
			(row) => row[2] === '-400' && row.slice(3).join('|') === 'bank-transfer|R-1|the deposit back'
		)
	);
	assert.ok(payments.rows.some((row) => row[2] === '-1000'));
});

test('a file with Arabic headers reads the method, the reference and the note', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });

	await seed(api);

	const tables = toTables(await api.transfer.get()).map((table) =>
		table.name === 'Payments'
			? { ...table, headers: ['العقد', 'التاريخ', 'المبلغ', 'طريقة الدفع', 'المرجع', 'ملاحظة'] }
			: table
	);
	const target = createMemoryDatabase();
	const plan = planWorkspaceImport(tables, NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan));

	await (await createApi({ db: target })).transfer.importWhole(toTransferInput(plan.transfer));

	assert.deepEqual((await snapshot(target)).payments, (await snapshot(db)).payments);
});

test('an import refuses refunds beyond what a contract received, naming the contract', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });

	await assert.rejects(
		api.transfer.importWhole({
			tenants: [{ name: 'Abby Kris', nationalId: '1234567890', phone: '+966512345678' }],
			complexes: [],
			units: [],
			contracts: [
				{
					reference: 'GOV-1',
					tenant: '1234567890',
					units: [],
					start: monthsFromNow(-2),
					end: monthsFromNow(10),
					interval: '12m',
					cost: 12_000
				}
			],
			payments: [
				{ contract: 'GOV-1', date: monthsFromNow(-2), amount: 500 },
				{ contract: 'GOV-1', date: monthsFromNow(-1), amount: -600 }
			]
		}),
		refusedWith('contract.refundsExceedReceivedNamed', { named: 'GOV-1' })
	);
	assert.deepEqual(await db.select().from(s.payment), []);
});

test('an import weighs its refunds against what the workspace already holds of a contract', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });

	await seed(api);

	const [reference] = (await snapshot(db)).contracts
		.filter((contract) => contract.status === 'terminated')
		.map((contract) => contract.reference!);
	const empty = { tenants: [], complexes: [], units: [], contracts: [] };

	// received 2000.5, already refunded 400: 1600.5 more is the most, and 1601 is past it.
	await assert.rejects(
		api.transfer.importWhole({
			...empty,
			payments: [{ contract: reference, date: monthsFromNow(0), amount: -1_601 }]
		}),
		refusedWith('contract.refundsExceedReceivedNamed', { named: reference })
	);

	// a refund within it lands on a terminated contract, as a refund recorded by hand does.
	await api.transfer.importWhole({
		...empty,
		payments: [{ contract: reference, date: monthsFromNow(0), amount: -1_600.5, note: 'the rest' }]
	});

	// and money received onto it is still refused, as it always was.
	await assert.rejects(
		api.transfer.importWhole({
			...empty,
			payments: [{ contract: reference, date: monthsFromNow(0), amount: 10 }]
		}),
		refusedWith('contract.terminatedLocked')
	);
});

/** what a stored payment holds beyond its contract, day and amount. */
async function extrasOf(db: Database) {
	return (await db.select().from(s.payment)).map(({ method, reference, note, direction }) => ({
		method,
		reference,
		note,
		direction
	}));
}

test('a file exported before refunds imports with every payment received', async () => {
	const written: WorkspaceTransfer = JSON.parse(
		readFileSync(new URL('./export.json', import.meta.url), 'utf8')
	);
	const { db } = await roundTrip(written);
	const extras = await extrasOf(db);

	assert.equal(extras.length, written.payments.length);
	assert.ok(
		extras.every(
			(extra) =>
				extra.direction === 'received' &&
				extra.method === null &&
				extra.reference === null &&
				extra.note === null
		)
	);
});

test('a workbook exported before refunds imports with every payment received', async () => {
	const workbook: ExportSheet[] = JSON.parse(
		readFileSync(new URL('./workbook.json', import.meta.url), 'utf8')
	);
	const plan = planWorkspaceImport(readBack(workbook), Date.UTC(2026, 0, 2), emptyHeld());

	assert.ok(isWorkspaceImportable(plan));

	const db = createMemoryDatabase();

	await (await createApi({ db })).transfer.importWhole(toTransferInput(plan.transfer));

	const extras = await extrasOf(db);

	assert.equal(extras.length, 3);
	assert.ok(extras.every((extra) => extra.direction === 'received' && extra.method === null));
	assert.deepEqual(
		(
			await db
				.select({ amount: s.payment.amount })
				.from(s.payment)
				.where(eq(s.payment.direction, 'received'))
		)
			.map((payment) => payment.amount)
			.sort(),
		[1500.5, 1500.5, 18000]
	);
});
