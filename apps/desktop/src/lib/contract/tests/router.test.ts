import assert from 'node:assert/strict';
import test from 'node:test';

import {
	countMatching,
	createApi,
	identityWithout,
	monthsFromNow,
	NOW,
	seedTenant,
	unusedId,
	refusedWith,
	refusalReadIn
} from '$lib/app/tests/testing.ts';
import { eq, sql } from 'drizzle-orm';

import { isRecordId } from '$lib/platform/database/identity.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import * as s from '$lib/platform/database/schema.ts';
import {
	type ContractInput,
	RENEWAL_WITHDRAWALS,
	seedComplexWithUnit,
	seedContract,
	seedRemindedContract,
	seedRenewedEndingSoon,
	withdrawRenewal
} from '$lib/contract/tests/seed.ts';

// --- Creation ------------------------------------------------------------------------

test('creating a contract returns it with a derived status and normalized fields', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = await api.contract.create({
		tenantId: tenant.id,
		govId: '  GOV-1  ',
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	assert.equal(contract.tenantId, tenant.id);
	assert.equal(contract.govId, 'GOV-1');
	assert.equal(contract.cost, 1000);
	assert.equal(contract.interval, '12m');
	assert.ok(isRecordId(contract.id));
	assert.equal(contract.paidAmount, 0);
});

test('creation rejects an end date before the start date', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(11),
				end: monthsFromNow(-1),
				interval: '12m',
				cost: 1000
			}),
		refusedWith('contract.endBeforeStart')
	);
});

test('creation rejects a non-positive cost', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 0
			}),
		refusedWith('contract.costNotPositive')
	);
});

test('creation rejects a period that is not a whole number of interval cycles', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(4),
				interval: '12m',
				cost: 1000
			}),
		refusedWith('contract.periodOffCycle')
	);
});

test('creation rejects a tenant that does not exist', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.contract.create({
				tenantId: unusedId(),
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 1000
			}),
		refusedWith('contract.tenantMissing')
	);
});

test('creation rejects a government id already used by another contract', async () => {
	const api = await createApi();
	await seedContract(api, { govId: 'DUP-1' });

	await assert.rejects(
		() => seedContract(api, { govId: 'DUP-1' }),
		refusedWith('contract.govIdTaken')
	);
});

// --- Creation with units -----------------------------------------------------------------
//
// effort 832, requirement 20: the contract form chooses the units, and one submission creates the
// contract and assigns them in one write (ADR 0027), as a renewal already does.

test('a contract is created holding the units chosen for it, in one batch', async () => {
	const statements: string[] = [];
	const db = createMemoryDatabase((sql) => statements.push(sql));
	const batches: string[][] = [];
	const batch = db.batch.bind(db);

	// every batch the procedure issues, with the statements that ran inside it.
	db.batch = (async (queries: Parameters<typeof db.batch>[0]) => {
		const from = statements.length;
		const result = await batch(queries);

		batches.push(statements.slice(from));

		return result;
	}) as unknown as typeof db.batch;

	const api = await createApi({ db });
	const tenant = await seedTenant(api);
	const first = await seedComplexWithUnit(api, 'Create-1');
	const second = await seedComplexWithUnit(api, 'Create-2');

	batches.length = 0;

	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		unitIds: [first.unit.id, second.unit.id]
	});

	assert.equal(batches.length, 1, 'the contract and its units were not written as one batch');
	assert.equal(countMatching(batches[0], /^\s*insert into "contract" /i), 1);
	assert.equal(countMatching(batches[0], /^\s*insert into "contract_unit"/i), 2);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: contract.id })).map((unit) => unit.id).sort(),
		[first.unit.id, second.unit.id].sort()
	);
});

test('a contract created with units occupies them', async () => {
	const api = await createApi();
	const { complex, unit } = await seedComplexWithUnit(api, 'Create-Occupied');

	await seedContract(api, { unitIds: [unit.id] });

	const units = await api.complex.units.getMany({ complexId: complex.id });

	assert.equal(units.find((held) => held.id === unit.id)?.status, 'occupied');
});

test('creation is refused a unit another contract holds over its term, and writes nothing', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Create-Contested');

	await seedContract(api, { unitIds: [unit.id] });

	const before = await api.contract.getMany({});

	await assert.rejects(
		() => seedContract(api, { unitIds: [unit.id] }),
		refusedWith('contract.unitsTaken')
	);
	assert.deepEqual(await api.contract.getMany({}), before);
});

test('creation takes a unit whose other contract runs over a different term', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Create-Later');

	await seedContract(api, { unitIds: [unit.id] });

	const later = await seedContract(api, {
		start: monthsFromNow(12),
		end: monthsFromNow(24),
		unitIds: [unit.id]
	});

	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: later.id })).map((held) => held.id),
		[unit.id]
	);
});

test('creation is refused a unit that is not in the workspace', async () => {
	const api = await createApi();

	await assert.rejects(
		() => seedContract(api, { unitIds: [unusedId()] }),
		refusedWith('contract.unitsMissing')
	);
});

// the inverse `useCreateContract` records: one deletion, which releases the units in the same
// batch. Redo creates it again with the identity and the units it had.
test('a creation with units is undone leaving neither, and redone with both', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Create-Undo');
	const variables = { unitIds: [unit.id] };
	const created = await seedContract(api, variables);

	await api.contract.delete({ id: created.id });

	assert.equal(await api.contract.get({ id: created.id }), undefined);
	assert.deepEqual(await api.contract.getMany({ unitId: unit.id }), []);

	const redone = await api.contract.create({ ...created, ...variables });

	assert.equal(redone.id, created.id);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: redone.id })).map((held) => held.id),
		[unit.id]
	);
});

// ticket 38, criterion 11(a): a contract without payments deletes at once whatever units it holds.
// They go in the same batch, the units read vacant again, and the deletion answers with them, so
// the inverse `useDeleteContract` records, restoring the row, puts back both.
test('a contract with units is deleted with them, and undone holding the same units', async () => {
	const api = await createApi();
	const first = await seedComplexWithUnit(api, 'Delete-Undo-1');
	const second = await seedComplexWithUnit(api, 'Delete-Undo-2');
	const unitIds = [first.unit.id, second.unit.id];
	const created = await seedContract(api, { unitIds });

	const deleted = await api.contract.delete({ id: created.id });

	assert.ok(deleted);
	assert.deepEqual([...deleted.unitIds].sort(), [...unitIds].sort());
	assert.equal(await api.contract.get({ id: created.id }), undefined);
	assert.deepEqual(await api.contract.units.getMany({ contractId: created.id }), []);

	for (const unitId of unitIds) {
		assert.equal((await api.complex.units.get({ id: unitId }))?.status, 'vacant');
	}

	const [undone] = await api.contract.restoreMany({ contracts: [deleted] });

	assert.equal(undone.id, created.id);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: created.id })).map((held) => held.id).sort(),
		[...unitIds].sort()
	);

	for (const unitId of unitIds) {
		assert.equal((await api.complex.units.get({ id: unitId }))?.status, 'occupied');
	}
});

test('a contract carrying a payment is still refused deletion, and keeps its units', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Delete-Paid');
	const created = await seedContract(api, { unitIds: [unit.id] });

	await api.payment.create({
		contractId: created.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() => api.contract.delete({ id: created.id }),
		refusedWith('contract.holdsPayments')
	);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: created.id })).map((held) => held.id),
		[unit.id]
	);
});

// effort 854, requirement 8: an undo of a creation deletes, and a record somebody else deleted
// first is refused rather than answered with nothing, which read as success.
test('deleting a missing contract is refused', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.contract.delete({ id: unusedId() }),
		refusedWith('contract.missing')
	);
});

// ticket 41: undoing a deletion puts the rows back as they were. A terminated contract comes back
// terminated, holding its unit, and the unit reads as it did before the deletion rather than
// occupied by a contract a create would have made active again.
test('a terminated contract holding a unit is deleted and undone as it was', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Restore-Terminated');
	const created = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: created.id });

	const before = (await api.complex.units.get({ id: unit.id }))?.status;
	const deleted = await api.contract.delete({ id: created.id });

	assert.ok(deleted);

	await api.contract.restoreMany({ contracts: [deleted] });

	assert.equal((await api.contract.get({ id: created.id }))?.status, 'terminated');
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: created.id })).map((held) => held.id),
		[unit.id]
	);
	assert.equal((await api.complex.units.get({ id: unit.id }))?.status, before);
});

// the same, after another contract took the released unit over an overlapping term. The undo
// restores rows rather than asking whether the unit is free today, and the other hold stays.
test('a deleted contract is undone holding its unit after another contract took it', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Restore-Taken');
	const created = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: created.id });

	const deleted = await api.contract.delete({ id: created.id });

	assert.ok(deleted);

	const other = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.restoreMany({ contracts: [deleted] });

	assert.equal((await api.contract.get({ id: created.id }))?.status, 'terminated');
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: created.id })).map((held) => held.id),
		[unit.id]
	);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: other.id })).map((held) => held.id),
		[unit.id]
	);
	assert.equal((await api.complex.units.get({ id: unit.id }))?.status, 'occupied');
});

// --- The contract a renewal continues --------------------------------------------------
//
// Effort 861, requirement 5, ticket 09: a contract may name the contract it renews. A renewal
// writes the link, and the reconcile writes it for a pair it recognises (requirement 6); create,
// a duplicate and an edit never do, and undoing a deletion puts it back with the row. These tests
// write it into the row themselves, as a renewal does (`renewal/tests/router.test.ts` holds the
// renewal's own), so each is about the link alone.

/** a caller over a database of its own, and a successor naming its predecessor as renewed. */
async function withRenewal() {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const predecessor = await seedContract(api, {
		start: monthsFromNow(-13),
		end: monthsFromNow(-1)
	});
	const successor = await seedContract(api, {
		tenantId: predecessor.tenantId,
		start: monthsFromNow(-1, 1),
		end: monthsFromNow(11)
	});

	await db
		.update(s.contract)
		.set({ renewsContractId: predecessor.id })
		.where(eq(s.contract.id, successor.id));

	return { api, predecessor, successor };
}

test('a contract reads the contract it renews, and one that renews nothing reads null', async () => {
	const { api, predecessor, successor } = await withRenewal();

	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, predecessor.id);
	assert.equal((await api.contract.get({ id: predecessor.id }))?.renewsContractId, null);
});

test('creating a contract cannot write the contract it renews', async () => {
	const { api, predecessor } = await withRenewal();
	// passed through a variable, as a caller that is not this application could send it.
	const sent = {
		tenantId: predecessor.tenantId,
		start: monthsFromNow(11, 1),
		end: monthsFromNow(23),
		interval: '12m' as const,
		cost: 1000,
		renewsContractId: predecessor.id
	};

	const created = await api.contract.create(sent);

	assert.equal(created.renewsContractId, null);
	assert.equal((await api.contract.get({ id: created.id }))?.renewsContractId, null);
});

test('a duplicate of a renewal does not carry the contract it renews', async () => {
	const { api, successor } = await withRenewal();
	const original = await api.contract.get({ id: successor.id });

	assert.ok(original);

	// what the duplicate act hands the form, sent whole: the contract as read, without its
	// identity and its government id (`host.svelte.ts`).
	const duplicate = await api.contract.create({
		...original,
		id: undefined,
		govId: '',
		start: monthsFromNow(11, 1),
		end: monthsFromNow(23)
	});

	assert.equal((await api.contract.get({ id: duplicate.id }))?.renewsContractId, null);
});

test('an edit neither writes nor clears the contract a renewal continues', async () => {
	const { api, predecessor, successor } = await withRenewal();
	const sent = {
		id: predecessor.id,
		tenantId: predecessor.tenantId,
		start: predecessor.start,
		end: predecessor.end,
		interval: predecessor.interval,
		cost: 1200,
		renewsContractId: successor.id
	};

	await api.contract.update(sent);
	await api.contract.update({ ...successor, govId: undefined, cost: 1300 });

	assert.equal((await api.contract.get({ id: predecessor.id }))?.renewsContractId, null);
	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, predecessor.id);
});

test('a deleted renewal is undone naming the contract it renews', async () => {
	const { api, predecessor, successor } = await withRenewal();

	const deleted = await api.contract.delete({ id: successor.id });

	assert.ok(deleted);
	assert.equal(deleted.renewsContractId, predecessor.id);

	const [undone] = await api.contract.restoreMany({ contracts: [deleted] });

	assert.equal(undone.renewsContractId, predecessor.id);
	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, predecessor.id);

	const many = await api.contract.deleteMany({ ids: [successor.id] });

	await api.contract.restoreMany({ contracts: many.deleted });

	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, predecessor.id);
});

// --- A renewed contract, read on its own -----------------------------------------------
//
// effort 861, requirement 7: the contract's own read says whether a standing successor renews it,
// which its page's renew act reads, and ranks it as ending soon only where none does.

test('a renewed contract reads as renewed and not as ending soon', async () => {
	const { api, contract, successor } = await seedRenewedEndingSoon();
	const read = await api.contract.get({ id: contract.id });

	assert.equal(read?.renewed, true);
	assert.equal(read?.rank, undefined);
	assert.equal((await api.contract.get({ id: successor.id }))?.renewed, false);
	// read by its reference, the same
	assert.equal((await api.contract.get({ govId: 'RENEWED' }))?.renewed, true);
});

for (const how of RENEWAL_WITHDRAWALS) {
	test(`a contract whose renewal was ${how} reads as ending soon again`, async () => {
		const seeded = await seedRenewedEndingSoon();
		const { api, contract, successor } = seeded;

		await withdrawRenewal(seeded, successor.id, how);

		const read = await api.contract.get({ id: contract.id });

		assert.equal(read?.renewed, false);
		assert.equal(read?.rank, 'ending-soon');
	});
}

// --- The renewals the reconcile recognises ---------------------------------------------
//
// Effort 861, requirement 6 and criterion 6, ticket 12: the whole-table reconcile links a renewal
// nothing recorded, by the rule `recognizeRenewals` states, and a second pass finds nothing left.

const DAY = 24 * 60 * 60 * 1000;

/** a caller over a database of its own, logging what it sends, and a renewal nothing linked. */
async function withUnlinkedRenewal() {
	const statements: string[] = [];
	const db = createMemoryDatabase((statement) => statements.push(statement));
	const api = await createApi({ db });
	const { unit: first } = await seedComplexWithUnit(api, 'Recognized-A');
	const { unit: second } = await seedComplexWithUnit(api, 'Recognized-B');
	const predecessor = await seedContract(api, {
		start: monthsFromNow(-13),
		end: monthsFromNow(-1),
		unitIds: [first.id, second.id]
	});
	const successor = await api.contract.create({
		tenantId: predecessor.tenantId,
		start: predecessor.end + DAY,
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		unitIds: [second.id, first.id]
	});

	return { api, db, statements, predecessor, successor };
}

test('the reconcile links a renewal nothing recorded, and a second pass changes nothing', async () => {
	const { api, db, statements, predecessor, successor } = await withUnlinkedRenewal();

	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, null);

	await api.contract.reconcile();

	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, predecessor.id);
	assert.equal((await api.contract.get({ id: predecessor.id }))?.renewsContractId, null);

	const before = await db.select().from(s.contract);

	statements.length = 0;
	await api.contract.reconcile();

	assert.deepEqual(await db.select().from(s.contract), before);
	assert.equal(
		countMatching(statements, /^\s*update\s+"contract"/i),
		0,
		'the second pass wrote a contract'
	);
});

test('the reconcile writes every link it finds and no other', async () => {
	const { api, statements } = await withUnlinkedRenewal();
	const renewsIn = (sent: readonly string[]) =>
		countMatching(sent, /^\s*update\s+"contract"\s+set\s+"renews_contract_id"/i);

	// a second, separate renewal, so the pass has two links to write.
	const other = await seedContract(api, { start: monthsFromNow(-25), end: monthsFromNow(-13) });
	const next = await api.contract.create({
		tenantId: other.tenantId,
		start: other.end + DAY,
		end: monthsFromNow(-1),
		interval: '12m',
		cost: 1000
	});

	statements.length = 0;
	await api.contract.reconcile();

	assert.equal(renewsIn(statements), 2);
	assert.equal((await api.contract.get({ id: next.id }))?.renewsContractId, other.id);
});

test('the reconcile links no contract on another tenant, other units, or another day', async () => {
	const { api, predecessor } = await withUnlinkedRenewal();
	const { unit } = await seedComplexWithUnit(api, 'Recognized-C');
	const otherTenant = await seedContract(api, {
		start: predecessor.end + DAY,
		end: monthsFromNow(11)
	});
	const otherUnits = await api.contract.create({
		tenantId: predecessor.tenantId,
		start: predecessor.end + DAY,
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		unitIds: [unit.id]
	});
	const otherDay = await api.contract.create({
		tenantId: predecessor.tenantId,
		start: predecessor.end + 2 * DAY,
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	await api.contract.reconcile();

	for (const contract of [otherTenant, otherUnits, otherDay]) {
		assert.equal((await api.contract.get({ id: contract.id }))?.renewsContractId, null);
	}
});

// criterion 6's workspace: the Rust seed walk opens its version-9 seed at 10 without reconciling,
// since the reconcile is the application's, so the walk's rows are seeded here at the shape the
// version-10 seed (`tauri/src/organization/lease/test/seed.rs`, `SEEDED_AT_TEN`) holds, with the
// renewal written as a build at 9 wrote it: the same tenant and both units, the day after
// `d0001` ends, and naming nothing.
test('a renewal a build at version 9 wrote, opened at 10, is linked by the reconcile', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });

	for (const statement of [
		"INSERT INTO `complex` (`id`, `name`, `location`) VALUES ('0199a000-0000-7000-8000-0000000c0001', 'North Towers', 'Riyadh, Olaya')",
		"INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`) VALUES ('0199a000-0000-7000-8000-000000070001', '1012345678', 'Sara Al-Harbi', '0501234567'), ('0199a000-0000-7000-8000-000000070002', '2098765432', 'Khalid Al-Otaibi', '0559876543')",
		"INSERT INTO `unit` (`id`, `name`, `status`, `complex_id`) VALUES ('0199a000-0000-7000-8000-0000000a0001', 'A-101', 'occupied', '0199a000-0000-7000-8000-0000000c0001'), ('0199a000-0000-7000-8000-0000000a0002', 'A-102', 'occupied', '0199a000-0000-7000-8000-0000000c0001')",
		"INSERT INTO `contract` (`id`, `gov_id`, `status`, `start_date`, `end_date`, `interval_in_months`, `cost_per_interval`, `paid_amount`, `expected_amount`, `tenant_id`) VALUES ('0199a000-0000-7000-8000-0000000d0001', '20250001', 'active', 1735689600000, 1767225600000, '6m', 30000.5, 15000.25, 30000.5, '0199a000-0000-7000-8000-000000070001'), ('0199a000-0000-7000-8000-0000000d0002', NULL, 'expired', 1704067200000, 1735603200000, '1m', 2500, 0, 0, '0199a000-0000-7000-8000-000000070002'), ('0199a000-0000-7000-8000-0000000d0003', '20260001', 'active', 1767312000000, 1798761600000, '6m', 30000.5, 0, 30000.5, '0199a000-0000-7000-8000-000000070001')",
		"INSERT INTO `contract_unit` (`contract_id`, `unit_id`) VALUES ('0199a000-0000-7000-8000-0000000d0001', '0199a000-0000-7000-8000-0000000a0001'), ('0199a000-0000-7000-8000-0000000d0001', '0199a000-0000-7000-8000-0000000a0002'), ('0199a000-0000-7000-8000-0000000d0002', '0199a000-0000-7000-8000-0000000a0002'), ('0199a000-0000-7000-8000-0000000d0003', '0199a000-0000-7000-8000-0000000a0001'), ('0199a000-0000-7000-8000-0000000d0003', '0199a000-0000-7000-8000-0000000a0002')"
	]) {
		await db.run(sql.raw(statement));
	}

	await api.contract.reconcile();

	const links = await db
		.select({ id: s.contract.id, renews: s.contract.renewsContractId })
		.from(s.contract)
		.orderBy(s.contract.id);

	assert.deepEqual(links, [
		{ id: '0199a000-0000-7000-8000-0000000d0001', renews: null },
		{ id: '0199a000-0000-7000-8000-0000000d0002', renews: null },
		{ id: '0199a000-0000-7000-8000-0000000d0003', renews: '0199a000-0000-7000-8000-0000000d0001' }
	]);
});

// --- Restoring a terminated contract -------------------------------------------------

// effort 854, requirement 4: a terminated contract holds its units without occupying them, so
// another contract may take one over the same term. Restoring the first would then double-book
// the unit, and it is refused naming the unit, leaving the contract terminated.
test('restoring a terminated contract is refused a unit another contract took since, naming it', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Restore-Held');
	const terminated = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: terminated.id });
	await seedContract(api, { unitIds: [unit.id] });

	await assert.rejects(
		() => api.contract.unterminate({ id: terminated.id }),
		refusedWith('contract.unitsTakenNamed', { named: 'Complex Restore-Held / Unit Restore-Held' })
	);
	assert.equal((await api.contract.get({ id: terminated.id }))?.status, 'terminated');
});

test('restoring a terminated contract takes back a unit another contract holds over a later term', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Restore-Later');
	const terminated = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: terminated.id });
	await seedContract(api, { start: monthsFromNow(12), end: monthsFromNow(24), unitIds: [unit.id] });

	const restored = await api.contract.unterminate({ id: terminated.id });

	assert.notEqual(restored.status, 'terminated');
});

test('the refusal of a restore names the unit inside its Arabic sentence', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Restore-Ar');
	const terminated = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: terminated.id });
	await seedContract(api, { unitIds: [unit.id] });

	assert.match(
		await refusalReadIn(() => api.contract.unterminate({ id: terminated.id })),
		/Complex Restore-Ar \/ Unit Restore-Ar/
	);
});

// --- Update --------------------------------------------------------------------------

test('updating a contract changes its stored fields', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const updated = await api.contract.update({
		id: contract.id,
		tenantId: contract.tenantId,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 2500
	});

	assert.equal(updated.cost, 2500);
});

test('updating a contract that does not exist is rejected', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await assert.rejects(
		() =>
			api.contract.update({
				id: unusedId(),
				tenantId: tenant.id,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 1000
			}),
		refusedWith('contract.missing')
	);
});

test('a terminated contract is locked against updates', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	await api.contract.terminate({ id: contract.id });

	await assert.rejects(
		() =>
			api.contract.update({
				id: contract.id,
				tenantId: contract.tenantId,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 3000
			}),
		refusedWith('contract.terminatedLocked')
	);
});

test('updating with an invalid cost is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.update({
				id: contract.id,
				tenantId: contract.tenantId,
				start: monthsFromNow(-1),
				end: monthsFromNow(11),
				interval: '12m',
				cost: 0
			}),
		refusedWith('contract.costNotPositive')
	);
});

// --- Derived status across every value ------------------------------------------------
//
// These pin the status model AS IT IS TODAY, which is surprising: a contract PAST its end
// date is `defaulted` when unpaid and `expired` when fully paid, while WITHIN its period it
// is `active` when unpaid and `fulfilled` when fully paid. "Current vs behind" plays no
// part. Pinned deliberately so a later correction (the contract domain module) is a
// visible, intended change — not an accident. Do not "fix" these expectations here.

test('derived status is scheduled when the contract starts in the future', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { start: monthsFromNow(2), end: monthsFromNow(14) });

	assert.equal(contract.status, 'scheduled');
});

test('derived status is active within the period when not fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api, {
		start: monthsFromNow(0, -10),
		end: monthsFromNow(12, -10)
	});

	assert.equal(contract.status, 'active');
});

test('derived status is fulfilled within the period once fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	const reloaded = await api.contract.get({ id: contract.id });
	assert.ok(reloaded);
	assert.equal(reloaded.status, 'fulfilled');
});

test('derived status is defaulted after the period without full payment', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });

	assert.equal(contract.status, 'defaulted');
});

test('derived status is expired after the period once fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });

	await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const reloaded = await api.contract.get({ id: contract.id });
	assert.ok(reloaded);
	assert.equal(reloaded.status, 'expired');
});

test('derived status is terminated once a contract is terminated', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const terminated = await api.contract.terminate({ id: contract.id });

	assert.equal(terminated.status, 'terminated');
});

// --- Payment aggregates on reads -------------------------------------------------------

test('creating a contract returns the expected amount for its whole period', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	assert.equal(contract.expectedAmount, 1000);
	assert.equal(contract.paidAmount, 0);
});
test('updating the cost updates the expected amount on reads', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const updated = await api.contract.update({
		id: contract.id,
		tenantId: contract.tenantId,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 2500
	});

	assert.equal(updated.expectedAmount, 2500);

	const reloaded = await api.contract.get({ id: contract.id });
	assert.ok(reloaded);
	assert.equal(reloaded.expectedAmount, 2500);
});

// criterion 12(c) of effort 835: the record page gates the act on the rank its read carries.
test('a contract is read with the rank it is filed under, and with none where it has none', async () => {
	const api = await createApi();
	const owing = await seedContract(api, {
		start: monthsFromNow(-6),
		end: monthsFromNow(6),
		cost: 2000
	});
	const unranked = await seedContract(api, { start: monthsFromNow(2), end: monthsFromNow(14) });

	assert.equal((await api.contract.get({ id: owing.id }))?.rank, 'owing');
	assert.equal((await api.contract.get({ govId: undefined, id: unranked.id }))?.rank, undefined);
	assert.ok(!('rank' in ((await api.contract.get({ id: unranked.id })) ?? {})));
});

// --- Refusals, as a reader of Arabic meets them ----------------------------------------
//
// effort 832, requirement 23: a refusal crosses as a code, and the interface words it in the
// reader's language. These read the contract refusals a form places under a field through the
// same function the form calls, in Arabic, which is where an English sentence used to surface.

test('the contract refusals a form shows read in Arabic', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);
	const create = (overrides: Partial<ContractInput>) =>
		api.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000,
			...overrides
		});

	assert.equal(
		await refusalReadIn(() => create({ start: monthsFromNow(11), end: monthsFromNow(-1) })),
		'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.'
	);
	assert.equal(
		await refusalReadIn(() => create({ cost: 0 })),
		'يجب أن تكون تكلفة الدفعة أكبر من صفر.'
	);
	// the cycle crosses as its stored key and is read back as the reader's word for it.
	assert.equal(
		await refusalReadIn(() => create({ end: monthsFromNow(4) })),
		'يجب أن يبقى تاريخ النهاية ضمن 5 أيام قبل أو بعد تاريخ نهاية دورة سنوي المحسوب.'
	);
	assert.equal(
		await refusalReadIn(() => create({ tenantId: unusedId() })),
		'لم يعد المستأجر المختار موجوداً في مساحة العمل. اختر مستأجراً آخر.'
	);

	await seedContract(api, { govId: 'DUP-1' });

	assert.equal(
		await refusalReadIn(() => create({ govId: 'DUP-1' })),
		'المعرف الحكومي مرتبط بعقد آخر.'
	);

	const { unit } = await seedComplexWithUnit(api, 'Arabic-Taken');

	await create({ unitIds: [unit.id] });

	assert.equal(
		await refusalReadIn(() => create({ unitIds: [unit.id] })),
		'يحتفظ عقد آخر بواحدة أو أكثر من الوحدات المختارة خلال هذه المدة. اختر وحدات أخرى أو مدة أخرى.'
	);
});
// --- What a member may not view ------------------------------------------------------------
//
// Effort 838, requirement 10: a contract's reads leave out every field of a kind the member may
// not view. The same workspace is read by a member holding every record act and by one lacking a
// single view flag.

test('without viewing tenants, a contract row, its rank, its search and its reminder name no tenant', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const { tenant, contract } = await seedRemindedContract(api, {
		govId: 'GOV-OWED',
		start: monthsFromNow(-13),
		end: monthsFromNow(-1),
		interval: '12m',
		cost: 4000
	});
	const lacking = await createApi({ db, identity: identityWithout('viewTenant') });

	const [everything] = await api.contract.getMany({});
	assert.equal(everything?.tenantName, tenant.name, 'the row named no tenant to leave out');

	for (const rows of [
		await lacking.contract.getMany({}),
		await lacking.contract.getMany({ rank: 'overdue' })
	]) {
		assert.deepEqual(
			rows.map((row) => row.id),
			[contract.id]
		);
		assert.equal('tenantName' in rows[0]!, false);
		assert.equal('tenantPhone' in rows[0]!, false);
	}

	// nor does the contract's own read, which names its tenant to a member who may see it.
	assert.equal((await api.contract.get({ id: contract.id }))?.tenantName, tenant.name);
	assert.equal('tenantName' in (await lacking.contract.get({ id: contract.id }))!, false);

	// nor is a contract found, or ordered, by a tenant the member is not shown.
	assert.equal((await api.contract.getMany({ search: tenant.name })).length, 1);
	assert.deepEqual(await lacking.contract.getMany({ search: tenant.name }), []);
	assert.deepEqual(await lacking.contract.search({ term: tenant.name }), []);
	assert.deepEqual(await lacking.contract.search({ term: 'GOV-OWED' }), [
		{ id: contract.id, label: 'GOV-OWED', hint: '' }
	]);

	assert.deepEqual(await lacking.contract.reminder({ id: contract.id }), {
		rank: 'overdue',
		contractNumber: 'GOV-OWED',
		amount: 4000,
		due: contract.start
	});
});

test('without viewing tenants, a numberless contract read names no reference, which spells the national id', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const tenant = await seedTenant(api);
	const contract = await seedContract(api, { tenantId: tenant.id });
	const lacking = await createApi({ db, identity: identityWithout('viewTenant') });

	// the reference a file calls a numberless contract by is its tenant's national id and its start.
	const reference = (await api.contract.get({ id: contract.id }))?.reference;

	assert.ok(
		reference?.includes(tenant.nationalId),
		'the fallback reference spells the national id'
	);

	const read = await lacking.contract.get({ id: contract.id });

	assert.equal(read?.id, contract.id);
	assert.equal('reference' in read!, false);
	assert.equal(JSON.stringify(read).includes(tenant.nationalId), false);

	// a contract with a government number is called by it, which names no tenant.
	const numbered = await seedContract(api, { tenantId: tenant.id, govId: 'GOV-READ' });

	assert.equal((await lacking.contract.get({ id: numbered.id }))?.reference, 'GOV-READ');
});

test('without viewing payments, a contract row counts no payments', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const contract = await seedContract(api);

	await api.payment.create({ contractId: contract.id, date: NOW, amount: 100 });

	const [everything] = await api.contract.getMany({});
	const [lacking] = await (
		await createApi({ db, identity: identityWithout('viewPayment') })
	).contract.getMany({});

	assert.equal(everything?.paymentCount, 1);
	assert.equal(lacking?.id, contract.id);
	assert.equal('paymentCount' in lacking!, false);
	// the contract's own figures are still the contract's to show.
	assert.equal(lacking?.paidAmount, 100);
});

test('without viewing complexes, the units a contract holds and may hold name no complex', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const { complex, unit } = await seedComplexWithUnit(api, 'Unnamed');
	const contract = await seedContract(api, { unitIds: [unit.id] });
	const lacking = await createApi({ db, identity: identityWithout('viewComplex') });

	assert.equal(
		(await api.contract.units.getMany({ contractId: contract.id }))[0]?.complexName,
		complex.name
	);

	const reads = [
		await lacking.contract.units.getMany({ contractId: contract.id }),
		await lacking.contract.units.getAssignableMany({ contractId: contract.id }),
		await lacking.contract.units.getAssignableForTerm({
			start: monthsFromNow(24),
			end: monthsFromNow(36)
		}),
		await lacking.contract.units.set({ contractId: contract.id, unitIds: [unit.id] })
	];

	for (const units of reads) {
		assert.deepEqual(
			units.map((held) => held.id),
			[unit.id]
		);
		assert.equal('complexName' in units[0]!, false);
	}

	// nor is a unit found by the complex holding it.
	assert.equal(
		(await api.contract.units.getAssignableMany({ contractId: contract.id, search: complex.name }))
			.length,
		1
	);
	assert.deepEqual(
		await lacking.contract.units.getAssignableMany({
			contractId: contract.id,
			search: complex.name
		}),
		[]
	);
});
