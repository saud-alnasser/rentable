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

	return api.contract.renew({
		contractId: contract.id,
		start: term.start.getTime(),
		end: term.end.getTime(),
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

test('the successor carries the original’s tenant, interval and cost', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { interval: '3m', cost: 2500 });

	const successor = await renew(api, contract);

	assert.equal(successor.tenantId, contract.tenantId);
	assert.equal(successor.interval, '3m');
	assert.equal(successor.cost, 2500);
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
				end: contract.end
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
				end: monthsFromNow(23)
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
				end: monthsFromNow(16)
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
				end: monthsFromNow(23)
			}),
		refusedWith('contract.missing')
	);
});

// undo empties the successor and deletes it, exactly as any other creation is taken back; redo
// states the identity it had, so a page still open on the successor is holding a live reference.
test('a renewal is undone by emptying and deleting the successor, and redone with its identity', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'Renew-Undo');

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	const original = await api.contract.get({ id: contract.id });
	const successor = await renew(api, contract);
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
		end: term.end.getTime()
	});

	assert.equal(redone.id, successor.id);
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

	assert.equal(
		await refusalReadIn(() =>
			api.contract.renew({ contractId: contract.id, start: contract.start, end: contract.end })
		),
		'يجب أن يبدأ التجديد بعد انتهاء العقد الذي يجدده.'
	);
	assert.equal(
		await refusalReadIn(() =>
			api.contract.renew({ contractId: unusedId(), start: contract.start, end: contract.end })
		),
		'لم يعد هذا العقد موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.'
	);
});
