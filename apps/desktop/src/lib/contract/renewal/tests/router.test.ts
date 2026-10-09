import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	createApi,
	monthsFromNow,
	unusedId,
	refusedWith,
	refusalReadIn
} from '$lib/app/tests/testing.ts';
import { getContractRenewalTerm } from '$lib/contract/renewal/renewal.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import * as s from '$lib/platform/database/schema.ts';
import { eq } from 'drizzle-orm';
import {
	type CreatedContract,
	seedComplexWithUnit,
	seedContract
} from '$lib/contract/tests/seed.ts';

// --- Renewal ---------------------------------------------------------------------------

// the term a renewal proposes, as the surfaces compute it: the day after the predecessor's
// last, over the same cycles. Stated once here so the assertions read as the screen does.
function renewalTerm(contract: CreatedContract) {
	return getContractRenewalTerm({
		start: contract.start,
		end: contract.end,
		interval: contract.interval
	});
}

async function renew(
	api: Api,
	contract: CreatedContract,
	overrides: Partial<Parameters<Api['contract']['renew']>[0]> = {}
) {
	const term = renewalTerm(contract);

	// the rent the form opens on is the predecessor's, so a renewal nobody changed sends that.
	return api.contract.renew({
		contractId: contract.id,
		start: term.start.getTime(),
		end: term.end.getTime(),
		cost: contract.cost,
		...overrides
	});
}

test('renewing produces a successor whose term follows the original’s', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const successor = await renew(api, contract);

	assert.notEqual(successor.id, contract.id);
	assert.equal(successor.start, contract.end + 24 * 60 * 60 * 1000);
	assert.ok(successor.end > successor.start);
});

// the one that regresses silently: nothing about renewal writes to the contract it renews, so
// the whole record is compared rather than its dates.
test('renewing leaves the original contract unaltered', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'ORIGINAL-1' });
	const { unit } = await seedComplexWithUnit(api, 'Renew-Untouched');

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	const before = await api.contract.get({ id: contract.id });

	await renew(api, contract);

	assert.deepEqual(await api.contract.get({ id: contract.id }), before);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
		[unit.id]
	);
});

test('the successor carries the tenant and the interval of the contract it renews', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { interval: '3m', cost: 2500 });

	const successor = await renew(api, contract);

	assert.equal(successor.tenantId, contract.tenantId);
	assert.equal(successor.interval, '3m');
});

// effort 861, requirement 5: a renewal records the contract it continues.
test('the successor names the contract it renews', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const successor = await renew(api, contract);

	assert.equal(successor.renewsContractId, contract.id);
	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, contract.id);
	assert.equal((await api.contract.get({ id: contract.id }))?.renewsContractId, null);
});

// effort 861, requirement 8 and criterion 8: a renewal may change the rent. The successor carries
// the rent entered and the predecessor is not written, which is read off the rows themselves, its
// payments included, rather than off what a read makes of them.
test('renewing at a different rent gives the successor that rent and leaves the renewed contract as it was', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const contract = await seedContract(api, { interval: '3m', cost: 2500 });

	await api.payment.create({ contractId: contract.id, date: monthsFromNow(-1, 1), amount: 2500 });

	const row = () => db.select().from(s.contract).where(eq(s.contract.id, contract.id)).get();
	const payments = () =>
		db.select().from(s.payment).where(eq(s.payment.contractId, contract.id)).all();
	const before = { row: await row(), payments: await payments() };

	const successor = await renew(api, contract, { cost: 2750 });

	assert.equal(successor.cost, 2750);
	assert.equal((await api.contract.get({ id: successor.id }))?.cost, 2750);
	assert.equal(before.payments.length, 1);
	assert.deepEqual({ row: await row(), payments: await payments() }, before);
});

test('renewing at the rent the form opens on keeps the old rent', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { interval: '3m', cost: 2500 });

	const successor = await renew(api, contract);

	assert.equal(successor.cost, 2500);
});

test('the successor is refused a rent that is not above zero', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() => renew(api, contract, { cost: 0 }),
		refusedWith('contract.costNotPositive')
	);
});

test('the successor carries the original’s units', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const complex = await api.complex.create({ name: 'Renewal Court', location: 'Riyadh' });
	const first = await api.complex.units.create({ name: 'R1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'R2', complexId: complex.id });

	await api.contract.units.set({ contractId: contract.id, unitIds: [first.id, second.id] });

	const successor = await renew(api, contract);
	const carried = await api.contract.units.getMany({ contractId: successor.id });

	assert.deepEqual(
		carried.map((unit) => unit.id).sort((left, right) => left.localeCompare(right)),
		[first.id, second.id].sort((left, right) => left.localeCompare(right))
	);
});

test('the successor takes no government id from the original', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-RENEW-1' });

	const successor = await renew(api, contract);

	assert.equal(successor.govId, '');
});

test('the successor may be given a government id of its own', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-RENEW-2' });

	const successor = await renew(api, contract, { govId: '  GOV-RENEW-3  ' });

	assert.equal(successor.govId, 'GOV-RENEW-3');
});

test('the successor is refused a government id another contract already holds', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-TAKEN' });

	await assert.rejects(
		() => renew(api, contract, { govId: 'GOV-TAKEN' }),
		refusedWith('contract.govIdTaken')
	);
});

test('renewal is refused where the original’s units are held over the new term', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'Renew-Contested');

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	// another contract takes the unit over exactly the term the renewal would run for.
	const term = renewalTerm(contract);
	const rival = await seedContract(api, {
		start: term.start.getTime(),
		end: term.end.getTime(),
		interval: contract.interval
	});

	await api.contract.units.set({ contractId: rival.id, unitIds: [unit.id] });

	await assert.rejects(() => renew(api, contract), refusedWith('contract.unitsUnavailable'));
});

test('a refused renewal writes nothing at all', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'Renew-Atomic');

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	const term = renewalTerm(contract);
	const rival = await seedContract(api, {
		start: term.start.getTime(),
		end: term.end.getTime(),
		interval: contract.interval
	});

	await api.contract.units.set({ contractId: rival.id, unitIds: [unit.id] });

	const before = await api.contract.getMany({});

	await assert.rejects(() => renew(api, contract));

	assert.deepEqual(await api.contract.getMany({}), before);
});

test('renewal is refused a term that starts before the original ends', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.renew({
				contractId: contract.id,
				start: contract.start,
				end: contract.end,
				cost: contract.cost
			}),
		refusedWith('contract.renewalBeforeEnd')
	);
});

test('renewal is refused a term that starts on the day the original ends', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.renew({
				contractId: contract.id,
				start: contract.end,
				end: monthsFromNow(23),
				cost: contract.cost
			}),
		refusedWith('contract.renewalBeforeEnd')
	);
});

test('renewal is refused a term that is not a whole number of the original’s cycles', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.renew({
				contractId: contract.id,
				start: contract.end + 24 * 60 * 60 * 1000,
				end: monthsFromNow(16),
				cost: contract.cost
			}),
		refusedWith('contract.periodOffCycle')
	);
});

test('renewal is refused for a contract that does not exist', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.contract.renew({
				contractId: unusedId(),
				start: monthsFromNow(12),
				end: monthsFromNow(23),
				cost: 1000
			}),
		refusedWith('contract.missing')
	);
});

// undo empties the successor and deletes it, exactly as any other creation is taken back; redo
// states the identity it had, so a page still open on the successor is holding a live reference.
// Redo sends what the renewal was sent (`renewal/query.ts`), so the link and the rent come back
// with the identity (effort 861, criterion 5).
test('a renewal is undone by emptying and deleting the successor, and redone with its identity', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'Renew-Undo');

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	const original = await api.contract.get({ id: contract.id });
	const successor = await renew(api, contract, { cost: 1200 });
	const term = renewalTerm(contract);

	await api.contract.units.set({ contractId: successor.id, unitIds: [] });
	await api.contract.delete({ id: successor.id });

	assert.equal(await api.contract.get({ id: successor.id }), undefined);
	// taking the renewal back leaves the contract it renewed where it was, units included.
	assert.deepEqual(await api.contract.get({ id: contract.id }), original);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
		[unit.id]
	);

	const redone = await api.contract.renew({
		contractId: contract.id,
		id: successor.id,
		start: term.start.getTime(),
		end: term.end.getTime(),
		cost: 1200
	});

	assert.equal(redone.id, successor.id);
	assert.equal(redone.renewsContractId, contract.id);
	assert.equal(redone.cost, 1200);
	assert.equal((await api.contract.get({ id: successor.id }))?.renewsContractId, contract.id);
	assert.equal((await api.contract.get({ id: successor.id }))?.cost, 1200);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: redone.id })).map((held) => held.id),
		[unit.id]
	);
});

test('renewal is refused an identity another contract already holds', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() => renew(api, contract, { id: contract.id }),
		refusedWith('record.idTaken')
	);
});

// --- Renewing what is already renewed --------------------------------------------------
//
// effort 861, requirement 7: a contract a standing successor renews is not up for renewal, so a
// second renewal of it is refused. A successor that was terminated, retired into its copy by a
// merge, or deleted no longer stands, and the contract may be renewed again.

/** a contract that ended a month ago, so the successor a renewal makes of it runs today. */
async function seedEnded(api: Api) {
	return seedContract(api, { start: monthsFromNow(-13), end: monthsFromNow(-1) });
}

test('a contract a standing renewal already renews is refused another', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await renew(api, contract);

	const before = await api.contract.getMany({});

	await assert.rejects(() => renew(api, contract), refusedWith('contract.alreadyRenewed'));
	assert.deepEqual(await api.contract.getMany({}), before);
});

test('a contract whose renewal was terminated may be renewed again', async () => {
	const api = await createApi();
	const contract = await seedEnded(api);
	const first = await renew(api, contract);

	await api.contract.terminate({ id: first.id });

	const second = await renew(api, contract);

	assert.notEqual(second.id, first.id);
	assert.equal(second.renewsContractId, contract.id);
});

test('a contract whose renewal was retired by a merge may be renewed again', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const contract = await seedContract(api);
	const first = await renew(api, contract);

	await db.update(s.contract).set({ mergedInto: unusedId() }).where(eq(s.contract.id, first.id));

	assert.equal((await renew(api, contract)).renewsContractId, contract.id);
});

test('a contract whose renewal was deleted may be renewed again', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const first = await renew(api, contract);

	await api.contract.delete({ id: first.id });

	assert.equal((await renew(api, contract)).renewsContractId, contract.id);
});

// a renewal that has not started yet is scheduled, which is what the reconcile pass writes to
// the row rather than the status the insert opened with.
test('the successor carries the status its own period derives', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const successor = await renew(api, contract);

	assert.equal(successor.status, 'scheduled');
	assert.equal(successor.paidAmount, 0);
	assert.equal(successor.expectedAmount, contract.expectedAmount);
});

// --- Refusals, as a reader of Arabic meets them ----------------------------------------
//
// effort 832, requirement 23: a refusal crosses as a code, and the interface words it in the
// reader's language.

test('a renewal refused for its term reads in Arabic', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const term = { start: contract.start, end: contract.end, cost: contract.cost };

	assert.equal(
		await refusalReadIn(() => api.contract.renew({ contractId: contract.id, ...term })),
		'يجب أن يبدأ التجديد بعد انتهاء العقد الذي يجدده.'
	);
	assert.equal(
		await refusalReadIn(() => api.contract.renew({ contractId: unusedId(), ...term })),
		'لم يعد هذا العقد موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.'
	);
});

test('a renewal of a contract already renewed reads in both languages', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await renew(api, contract);

	assert.equal(
		await refusalReadIn(() => renew(api, contract), 'ar'),
		'جُدّد هذا العقد من قبل. افتح تجديده لتعديله.'
	);
	assert.equal(
		await refusalReadIn(() => renew(api, contract), 'en'),
		'this contract is already renewed. open its renewal to change it.'
	);
});
