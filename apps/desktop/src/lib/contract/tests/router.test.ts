import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	monthsFromNow,
	seedTenant,
	unusedId,
	withStatementLog
} from '$lib/api/tests/testing.ts';
import { isRecordId } from '$lib/platform/database/identity.ts';
import type { ContractSortColumnId } from '$lib/contract/contract.ts';
import type { ContractRank } from '$lib/contract/rank.ts';
import { getContractRenewalTerm } from '$lib/contract/renewal.ts';
import type { ListSort } from '$lib/design/sort.ts';

/** what a contract is created from, and what one comes back as, as the caller states them. */
type ContractInput = Parameters<Api['contract']['create']>[0];
type CreatedContract = Awaited<ReturnType<Api['contract']['create']>>;
/** the sort a contracts list may be asked for, as the procedure states it. */
type ContractSort = NonNullable<NonNullable<Parameters<Api['contract']['getMany']>[0]>['sort']>;

async function seedComplexWithUnit(api: Api, label: string) {
	const complex = await api.complex.create({ name: `Complex ${label}`, location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: `Unit ${label}`, complexId: complex.id });

	return { complex, unit };
}

async function seedContract(api: Api, overrides: Partial<ContractInput> = {}) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		...overrides
	});
}

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
		/end date must be after start date/
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
		/cost per payment must be greater than zero/
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
		/contract period must stay within/
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
		/tenant does not exist/
	);
});

test('creation rejects a government id already used by another contract', async () => {
	const api = await createApi();
	await seedContract(api, { govId: 'DUP-1' });

	await assert.rejects(() => seedContract(api, { govId: 'DUP-1' }), /government id is associated/);
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
		/contract does not exist/
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
		/terminated contracts are locked/
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
		/cost per payment must be greater than zero/
	);
});

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
		/government id is associated/
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

	await assert.rejects(() => renew(api, contract), /already assigned to an overlapping contract/);
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
		/a renewal must start after the contract it renews ends/
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
		/a renewal must start after the contract it renews ends/
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
		/contract period must stay within/
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
		/contract does not exist/
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
		/another record already holds that id/
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

// --- Unit assignment -----------------------------------------------------------------

test('a unit can be assigned to a contract and then removed', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'A');

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});

	const assigned = await api.contract.units.getMany({ contractId: contract.id });
	assert.equal(assigned.length, 1);
	assert.equal(assigned[0].id, unit.id);

	await api.contract.units.set({ contractId: contract.id, unitIds: [] });

	const afterRemoval = await api.contract.units.getMany({ contractId: contract.id });
	assert.equal(afterRemoval.length, 0);
});

test('the set is what the contract ends up holding, not what is added to it', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const complex = await api.complex.create({ name: 'Set Court', location: 'Riyadh' });
	const first = await api.complex.units.create({ name: 'S1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'S2', complexId: complex.id });

	await api.contract.units.set({ contractId: contract.id, unitIds: [first.id] });
	const held = await api.contract.units.set({ contractId: contract.id, unitIds: [second.id] });

	assert.deepEqual(
		held.map((unit) => unit.id),
		[second.id]
	);
});

test('units from more than one complex are held at once', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const one = await seedComplexWithUnit(api, 'X');
	const other = await seedComplexWithUnit(api, 'Y');

	const held = await api.contract.units.set({
		contractId: contract.id,
		unitIds: [one.unit.id, other.unit.id]
	});

	assert.deepEqual(held.map((unit) => unit.id).sort(), [one.unit.id, other.unit.id].sort());
});

test('the assignable set offers every unit no overlapping contract holds', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const held = await seedComplexWithUnit(api, 'P');
	const free = await seedComplexWithUnit(api, 'Q');
	const taken = await seedComplexWithUnit(api, 'R');

	const other = await seedContract(api);
	await api.contract.units.set({ contractId: other.id, unitIds: [taken.unit.id] });
	await api.contract.units.set({ contractId: contract.id, unitIds: [held.unit.id] });

	const assignable = await api.contract.units.getAssignableMany({ contractId: contract.id });
	const byId = new Map(assignable.map((unit) => [unit.id, unit]));

	assert.equal(byId.get(held.unit.id)?.isAssigned, true);
	assert.equal(byId.get(free.unit.id)?.isAssigned, false);
	assert.equal(byId.has(taken.unit.id), false, 'a unit an overlapping contract holds was offered');
});

test('the assignable search narrows on the unit name and on the complex holding it', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const tower = await api.complex.create({ name: 'Coral Tower', location: 'Jeddah' });
	const court = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const inTower = await api.complex.units.create({ name: 'A1', complexId: tower.id });
	const inCourt = await api.complex.units.create({ name: 'B2', complexId: court.id });

	const byComplex = await api.contract.units.getAssignableMany({
		contractId: contract.id,
		search: 'Coral'
	});
	const byUnit = await api.contract.units.getAssignableMany({
		contractId: contract.id,
		search: 'B2'
	});

	assert.deepEqual(
		byComplex.map((unit) => unit.id),
		[inTower.id]
	);
	assert.deepEqual(
		byUnit.map((unit) => unit.id),
		[inCourt.id]
	);
});

test('assigning a unit already held by an overlapping contract is rejected', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'B');

	const first = await seedContract(api);
	await api.contract.units.set({
		contractId: first.id,
		unitIds: [unit.id]
	});

	const second = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.units.set({
				contractId: second.id,
				unitIds: [unit.id]
			}),
		/overlapping contract/
	);
});

test('a set naming a unit that does not exist is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() => api.contract.units.set({ contractId: contract.id, unitIds: [unusedId()] }),
		/one or more units could not be found/
	);
});

test('a unit cannot be assigned once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'C');

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() =>
			api.contract.units.set({
				contractId: contract.id,
				unitIds: [unit.id]
			}),
		/cannot change contract units after payments have been registered/
	);
});

test('a unit cannot be removed once the contract has payments', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'D');

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});
	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await assert.rejects(
		() => api.contract.units.set({ contractId: contract.id, unitIds: [] }),
		/cannot change contract units after payments have been registered/
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

	await api.contract.payments.create({
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

	await api.contract.payments.create({
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

// --- Stored unit status across reconcile ------------------------------------------------
//
// The dashboard's occupancy summary is the one read of the STORED unit status, so it is
// what proves reconcile wrote the unit rows a mutation touched.

test('stored unit occupancy follows assignment and removal', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, 'E');

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [unit.id]
	});

	const afterAssign = await api.contract.dashboard();
	assert.equal(afterAssign.summary.occupancy.occupiedUnits, 1);

	await api.contract.units.set({ contractId: contract.id, unitIds: [] });

	const afterRemoval = await api.contract.dashboard();
	assert.equal(afterRemoval.summary.occupancy.occupiedUnits, 0);
});

test('a mutation on one contract keeps a shared unit occupied by the other', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'F');
	const past = await seedContract(api, { start: monthsFromNow(-14), end: monthsFromNow(-2) });
	const current = await seedContract(api);

	await api.contract.units.set({
		contractId: past.id,
		unitIds: [unit.id]
	});
	await api.contract.units.set({
		contractId: current.id,
		unitIds: [unit.id]
	});

	await api.contract.payments.create({
		contractId: past.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const reloadedPast = await api.contract.get({ id: past.id });
	assert.ok(reloadedPast);
	assert.equal(reloadedPast.status, 'expired');

	const dashboard = await api.contract.dashboard();
	assert.equal(dashboard.summary.occupancy.occupiedUnits, 1);
});

// --- Payment aggregates on reads -------------------------------------------------------

test('creating a contract returns the expected amount for its whole period', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	assert.equal(contract.expectedAmount, 1000);
	assert.equal(contract.paidAmount, 0);
});

test('the contract list carries the payment aggregates after a payment', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 400
	});

	const contracts = await api.contract.getMany({});
	const listed = contracts.find((candidate) => candidate.id === contract.id);

	assert.ok(listed);
	assert.equal(listed.paidAmount, 400);
	assert.equal(listed.expectedAmount, 1000);
});

test('the contract list carries how many payments are recorded against each contract', async () => {
	const api = await createApi();
	const paid = await seedContract(api);
	const untouched = await seedContract(api);

	await api.contract.payments.create({ contractId: paid.id, date: monthsFromNow(0), amount: 100 });
	await api.contract.payments.create({ contractId: paid.id, date: monthsFromNow(0), amount: 200 });

	const contracts = await api.contract.getMany({});
	const listed = (id: string) => contracts.find((candidate) => candidate.id === id);

	assert.equal(listed(paid.id)?.paymentCount, 2);
	// a contract nobody has paid is counted as zero rather than dropped from the list — the
	// count rides the row, so a missing one would be a contract missing from the directory.
	assert.equal(listed(untouched.id)?.paymentCount, 0);
});

test('the contract list narrows to one tenant when asked', async () => {
	const api = await createApi();
	const held = await seedContract(api);
	await seedContract(api);

	const listed = await api.contract.getMany({ tenantId: held.tenantId });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[held.id]
	);
});

test('narrowing to a tenant with no contracts answers with an empty list', async () => {
	const api = await createApi();
	await seedContract(api);
	const stranger = await seedTenant(api);

	assert.deepEqual(await api.contract.getMany({ tenantId: stranger.id }), []);
});

test('a tenant filter and a search narrow together rather than one replacing the other', async () => {
	const api = await createApi();
	const held = await seedContract(api, { govId: 'KEEP-1' });
	await seedContract(api, { govId: 'DROP-1' });

	// the search matches nothing this tenant holds, so the pair must intersect: a filter that
	// replaced the search would answer with the tenant's whole set instead.
	assert.deepEqual(await api.contract.getMany({ tenantId: held.tenantId, search: 'DROP' }), []);

	const both = await api.contract.getMany({ tenantId: held.tenantId, search: 'KEEP' });
	assert.deepEqual(
		both.map((contract) => contract.id),
		[held.id]
	);
});

test('the contract list narrows to the contracts that mention one unit', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'U');
	const mentions = await seedContract(api);
	await seedContract(api);

	await api.contract.units.set({
		contractId: mentions.id,
		unitIds: [unit.id]
	});

	const listed = await api.contract.getMany({ unitId: unit.id });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[mentions.id]
	);
});

test('a contract holding several units appears once when narrowed to one of them', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Multi Court', location: 'Riyadh' });
	const first = await api.complex.units.create({ name: 'M1', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'M2', complexId: complex.id });
	const contract = await seedContract(api);

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [first.id, second.id]
	});

	// matched through the assignment table rather than joined to it: a join would multiply the
	// contract into one row per unit it holds.
	const listed = await api.contract.getMany({ unitId: first.id });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[contract.id]
	);
});

test('the contract list narrows to the contracts that hold a unit in one complex', async () => {
	const api = await createApi();
	const { complex, unit } = await seedComplexWithUnit(api, 'C');
	const elsewhere = await seedComplexWithUnit(api, 'D');
	const holds = await seedContract(api);
	const other = await seedContract(api);

	await api.contract.units.set({ contractId: holds.id, unitIds: [unit.id] });
	await api.contract.units.set({ contractId: other.id, unitIds: [elsewhere.unit.id] });

	const listed = await api.contract.getMany({ complexId: complex.id });

	assert.deepEqual(
		listed.map((contract) => contract.id),
		[holds.id]
	);
});

test('narrowing to a complex holding no units answers with an empty list', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'E');
	const empty = await api.complex.create({ name: 'Empty Court', location: 'Riyadh' });
	const holds = await seedContract(api);

	await api.contract.units.set({ contractId: holds.id, unitIds: [unit.id] });

	assert.deepEqual(await api.contract.getMany({ complexId: empty.id }), []);
});

test('a contract holding units in two complexes appears once in each', async () => {
	const api = await createApi();
	const first = await seedComplexWithUnit(api, 'F');
	const second = await seedComplexWithUnit(api, 'G');
	const spare = await api.complex.units.create({
		name: 'Unit F2',
		complexId: first.complex.id
	});
	const contract = await seedContract(api);

	await api.contract.units.set({
		contractId: contract.id,
		unitIds: [first.unit.id, spare.id, second.unit.id]
	});

	// two units of this contract sit in the first complex, so a join through the assignment
	// table would answer with the contract twice.
	for (const complexId of [first.complex.id, second.complex.id]) {
		const listed = await api.contract.getMany({ complexId });

		assert.deepEqual(
			listed.map((candidate) => candidate.id),
			[contract.id]
		);
	}
});

test('the payment count follows a deleted payment back down', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await api.contract.payments.delete({ id: payment.id });

	const listed = (await api.contract.getMany({})).find((candidate) => candidate.id === contract.id);

	assert.equal(listed?.paymentCount, 0);
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

// --- The directory ----------------------------------------------------------------------
//
// `getMany` answers the contracts list, which opens as a directory rather than a queue: the
// order is whichever key the sort control chose, and the search is the query's own. Both are
// asserted here because both are what the list may not redo on the client.

// Seeds one contract per status, created in an order that is not the order they come back
// in — so a test asserting attention order cannot pass on insertion order by accident.
async function seedOneContractPerStatus(api: Api) {
	const scheduled = await seedContract(api, {
		govId: 'GOV-SCHEDULED',
		start: monthsFromNow(2),
		end: monthsFromNow(14)
	});
	const expired = await seedContract(api, {
		govId: 'GOV-EXPIRED',
		start: monthsFromNow(-14),
		end: monthsFromNow(-2)
	});

	await api.contract.payments.create({
		contractId: expired.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const terminated = await seedContract(api, { govId: 'GOV-TERMINATED' });

	await api.contract.terminate({ id: terminated.id });

	const active = await seedContract(api, { govId: 'GOV-ACTIVE' });
	const fulfilled = await seedContract(api, { govId: 'GOV-FULFILLED' });

	await api.contract.payments.create({
		contractId: fulfilled.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	const defaulted = await seedContract(api, {
		govId: 'GOV-DEFAULTED',
		start: monthsFromNow(-14),
		end: monthsFromNow(-2)
	});

	return { defaulted, active, scheduled, fulfilled, expired, terminated };
}

test('the directory opens ordered by tenant name, then by when the contract runs', async () => {
	const api = await createApi();
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// Zaid's contract is created first, so an insertion order would put him at the top.
	const zaidContract = await seedContract(api, { tenantId: zaid.id, govId: 'GOV-Z' });
	const amalLater = await seedContract(api, {
		tenantId: amal.id,
		govId: 'GOV-A-LATER',
		start: monthsFromNow(1),
		end: monthsFromNow(13)
	});
	const amalEarlier = await seedContract(api, {
		tenantId: amal.id,
		govId: 'GOV-A-EARLIER',
		start: monthsFromNow(-6),
		end: monthsFromNow(6)
	});

	assert.deepEqual(
		(await api.contract.getMany({})).map((contract) => contract.id),
		[amalEarlier.id, amalLater.id, zaidContract.id]
	);
});

test('the directory orders by every key the sort control offers', async () => {
	const api = await createApi();
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// Amal's contract starts earlier and ends later, so no two keys agree on the same pair
	// and a key wired to the wrong column shows up as a wrong order.
	const amalContract = await seedContract(api, {
		tenantId: amal.id,
		govId: 'GOV-2',
		start: monthsFromNow(-3),
		end: monthsFromNow(9),
		cost: 2000
	});
	const zaidContract = await seedContract(api, {
		tenantId: zaid.id,
		govId: 'GOV-1',
		start: monthsFromNow(-1),
		end: monthsFromNow(2),
		interval: '3m',
		cost: 1000
	});

	const orderBy = async (columnId: ContractSortColumnId, direction: ListSort['direction']) =>
		(await api.contract.getMany({ sort: { columnId, direction } })).map((contract) => contract.id);

	assert.deepEqual(await orderBy('tenantName', 'asc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('tenantName', 'desc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('govId', 'asc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('govId', 'desc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('start', 'asc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('start', 'desc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('end', 'asc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('end', 'desc'), [amalContract.id, zaidContract.id]);
	assert.deepEqual(await orderBy('cost', 'asc'), [zaidContract.id, amalContract.id]);
	assert.deepEqual(await orderBy('cost', 'desc'), [amalContract.id, zaidContract.id]);
});

test('ordering the directory by status follows the attention ranking', async () => {
	const api = await createApi();

	await seedOneContractPerStatus(api);

	const attentionOrder = ['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated'];

	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'status', direction: 'asc' } })).map(
			(contract) => contract.status
		),
		attentionOrder
	);
	// descending reverses the ranking rather than reading the enum backwards by name, which
	// is the only ordering of these six words that means anything.
	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'status', direction: 'desc' } })).map(
			(contract) => contract.status
		),
		[...attentionOrder].reverse()
	);
});

test('the directory refuses to order by a column the sort control does not offer', async () => {
	const api = await createApi();

	// `paidAmount` is outside the sort vocabulary, so it cannot be named in the caller's own
	// type — the vocabulary *is* the type. It arrives here the way a reader's chosen column
	// really does, as the plain string of a `ListSort`, with the vocabulary guard the query
	// layer applies skipped: what is asserted is that the procedure refuses it on its own.
	const chosen: ListSort = { columnId: 'paidAmount', direction: 'asc' };

	await assert.rejects(() => api.contract.getMany({ sort: chosen as ContractSort }));
});

test('contracts tied on the chosen order fall back to the directory order', async () => {
	const api = await createApi();
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// created Zaid's first, so an id tie-break would put it first and a name one would not.
	const zaidContract = await seedContract(api, { tenantId: zaid.id, cost: 1000 });
	const amalContract = await seedContract(api, { tenantId: amal.id, cost: 1000 });

	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'cost', direction: 'desc' } })).map(
			(contract) => contract.id
		),
		[amalContract.id, zaidContract.id]
	);

	// both contracts also start on the same day, and start is itself one of the fallback
	// terms: ordering by it falls through to the tenant name rather than to the start again.
	assert.deepEqual(
		(await api.contract.getMany({ sort: { columnId: 'start', direction: 'desc' } })).map(
			(contract) => contract.id
		),
		[amalContract.id, zaidContract.id]
	);
});

test('searching the contract list narrows it and keeps the chosen order', async () => {
	const api = await createApi();
	const seeded = await seedOneContractPerStatus(api);
	const tenant = await api.tenant.get({ id: seeded.active.tenantId });

	assert.ok(tenant);
	assert.deepEqual(
		(await api.contract.getMany({ search: 'GOV-ACTIVE' })).map((contract) => contract.id),
		[seeded.active.id]
	);
	assert.deepEqual(
		(await api.contract.getMany({ search: tenant.name })).map((contract) => contract.id),
		[seeded.active.id]
	);
	assert.deepEqual(
		(await api.contract.getMany({ search: tenant.phone })).map((contract) => contract.id),
		[seeded.active.id]
	);
	assert.deepEqual(
		(
			await api.contract.getMany({
				search: 'gov-',
				sort: { columnId: 'status', direction: 'asc' }
			})
		).map((contract) => contract.status),
		['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated']
	);
	assert.deepEqual(await api.contract.getMany({ search: 'nothing matches this' }), []);
});

// The row shows the tenant, the contract number, the period, the status and the cost; the
// phone, the tenant id and the interval as it is stored are not on it. Decision 03 holds
// that a field a surface does not show is still a field the list is searched by.
test('the contract search reaches the fields the row does not show', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-HIDDEN', interval: '3m', cost: 4321 });

	for (const term of ['GOV-HIDDEN', '3m', '4321', 'active']) {
		assert.deepEqual(
			(await api.contract.getMany({ search: term })).map((candidate) => candidate.id),
			[contract.id],
			`search term ${term}`
		);
	}
});

test('the contract search treats a wildcard character as text', async () => {
	const api = await createApi();

	await seedContract(api, { govId: 'GOV-PLAIN' });
	const literal = await seedContract(api, { govId: 'GOV-50%-SHARE' });

	assert.deepEqual(
		(await api.contract.getMany({ search: '50%' })).map((contract) => contract.id),
		[literal.id]
	);
	assert.deepEqual(await api.contract.getMany({ search: 'GOV_PLAIN' }), []);
});

test('the contract list returns the whole result set', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	for (let index = 0; index < 30; index += 1) {
		await api.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000 + index
		});
	}

	assert.equal((await api.contract.getMany({})).length, 30);
});

// --- Palette search -------------------------------------------------------------------

test('a contract is found by its reference or by the tenant holding it', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-42' });
	const tenant = await api.tenant.get({ id: contract.tenantId });

	assert.ok(tenant);
	assert.deepEqual(
		(await api.contract.search({ term: 'GOV-4' })).map((match) => match.id),
		[contract.id]
	);
	assert.deepEqual(
		(await api.contract.search({ term: tenant.name })).map((match) => match.label),
		['GOV-42']
	);
});

// a contract's reference is optional, so the tenant holding it is the handle when there is none.
test('a contract with no reference is found under the tenant holding it', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const tenant = await api.tenant.get({ id: contract.tenantId });

	assert.ok(tenant);
	assert.deepEqual(
		(await api.contract.search({ term: tenant.name })).map((match) => match.label),
		[tenant.name]
	);
});

test('a payment is found by its amount, across every contract', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'GOV-7' });
	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1234
	});

	const found = await api.contract.payments.search({ term: '1234' });

	assert.deepEqual(
		found.map((match) => match.id),
		[payment.id]
	);
	assert.equal(found[0].hint, 'GOV-7');
});

// --- Attention rank ------------------------------------------------------------------

// One contract per rank plus one in none, so a filter that answered with everything or with
// nothing is distinguishable from one that answered correctly.
async function seedRankedPortfolio(api: Api) {
	const tenant = await seedTenant(api);

	const contract = (govId: string, cost: number, startMonths: number, endMonths: number) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(startMonths),
			end: monthsFromNow(endMonths),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('RANK-OVERDUE', 4000, -13, -1);
	await contract('RANK-OWING', 2000, -6, 6);

	// paid in full and ending inside the notice window: owes nothing, so it ranks as a renewal.
	const ending = await contract('RANK-ENDING', 100, -11, 1);
	await api.contract.payments.create({
		contractId: ending.id,
		amount: 100,
		date: monthsFromNow(-2)
	});

	// starts in two months and owes nothing yet — in no rank at all.
	await contract('RANK-NONE', 3000, 2, 14);
}

test('the contracts list narrows to one attention rank', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	const govIds = async (rank: ContractRank) =>
		(await api.contract.getMany({ rank })).map((contract) => contract.govId);

	assert.deepEqual(await govIds('overdue'), ['RANK-OVERDUE']);
	assert.deepEqual(await govIds('owing'), ['RANK-OWING']);
	assert.deepEqual(await govIds('ending-soon'), ['RANK-ENDING']);
});

test('asking for no rank answers with every contract, ranked or not', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	const all = await api.contract.getMany({});

	assert.equal(all.length, 4);
	assert.ok(all.some((contract) => contract.govId === 'RANK-NONE'));
});

test('a rank and a search narrow together rather than replacing one another', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	assert.deepEqual(
		(await api.contract.getMany({ rank: 'owing', search: 'RANK-OWING' })).map((c) => c.govId),
		['RANK-OWING']
	);
	assert.deepEqual(await api.contract.getMany({ rank: 'owing', search: 'RANK-OVERDUE' }), []);
});

// the order is part of what a rank means (ADR 0031), so a caller that asked for a rank and
// named no sort gets follow-up order — largest debt first inside a money rank.
test('a rank with no chosen sort answers in the rank’s own order', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = (govId: string, cost: number) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(-6),
			end: monthsFromNow(6),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('SMALL', 1200);
	await contract('LARGE', 9000);
	await contract('MIDDLE', 4800);

	assert.deepEqual(
		(await api.contract.getMany({ rank: 'owing' })).map((c) => c.govId),
		['LARGE', 'MIDDLE', 'SMALL']
	);
});

test('a chosen sort still wins over the rank’s own order', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = (govId: string, cost: number) =>
		api.contract.create({
			govId,
			cost,
			start: monthsFromNow(-6),
			end: monthsFromNow(6),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('SMALL', 1200);
	await contract('LARGE', 9000);
	await contract('MIDDLE', 4800);

	const sorted = await api.contract.getMany({
		rank: 'owing',
		sort: { columnId: 'cost', direction: 'asc' }
	});

	assert.deepEqual(
		sorted.map((c) => c.govId),
		['SMALL', 'MIDDLE', 'LARGE']
	);
});

// The boundary the two money ranks meet at, and the one place narrowing a query on the end
// date can silently lose a contract: a rank turns over at the start of the UTC day, not at the
// instant the list is read. A contract ending today owes today and is not yet late.
test('a contract ending today is owing, and one ending yesterday is overdue', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = (govId: string, days: number) =>
		api.contract.create({
			govId,
			cost: 1000,
			start: monthsFromNow(-12, days),
			end: monthsFromNow(0, days),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('BOUNDARY-TODAY', 0);
	await contract('BOUNDARY-YESTERDAY', -1);

	assert.deepEqual(
		(await api.contract.getMany({ rank: 'owing' })).map((c) => c.govId),
		['BOUNDARY-TODAY']
	);
	assert.deepEqual(
		(await api.contract.getMany({ rank: 'overdue' })).map((c) => c.govId),
		['BOUNDARY-YESTERDAY']
	);
});

// --- What a rank costs ---------------------------------------------------------------

/** Every statement a block of work issued, with how many rows each answered with. */
type StatementRead = { sql: string; rowCount: number };

/**
 * The one statement the contracts list is: a select over the contract table joined to its
 * tenant. Found rather than assumed to be the only one, so a membership read or a future
 * statement beside it cannot be mistaken for the list.
 */
function contractListRead(reads: readonly StatementRead[]) {
	const matching = reads.filter(
		(read) => /^select/i.test(read.sql) && /from "contract"/.test(read.sql)
	);

	assert.equal(matching.length, 1, `expected one contract list read, saw ${matching.length}`);

	return matching[0];
}

/**
 * A workspace of a thousand contracts in which only a handful are overdue, and the rest are
 * kept out of that rank by each of the two bounds in turn: half end in the future, and half
 * ended in the past having been paid in full.
 *
 * Both, rather than whichever is easier to seed: a query that narrowed on the dates alone and
 * a query that narrowed on the balance alone would each pass against a fixture that only used
 * the other.
 */
async function seedWorkspaceWithFewOverdue(api: Api) {
	const tenant = await seedTenant(api);
	const overdueGovIds = ['COST-OVERDUE-1', 'COST-OVERDUE-2', 'COST-OVERDUE-3'];

	const contract = (govId: string | undefined, startMonths: number, endMonths: number) =>
		api.contract.create({
			govId,
			cost: 1000,
			start: monthsFromNow(startMonths),
			end: monthsFromNow(endMonths),
			interval: '12m',
			tenantId: tenant.id
		});

	for (let index = 0; index < 500; index += 1) {
		await contract(undefined, -1, 11);
	}

	for (let index = 0; index < 500; index += 1) {
		const settled = await contract(undefined, -13, -1);

		await api.contract.payments.create({
			contractId: settled.id,
			amount: 1000,
			date: monthsFromNow(-12)
		});
	}

	for (const govId of overdueGovIds) {
		await contract(govId, -13, -1);
	}

	return { overdueGovIds };
}

// The assertion the ticket exists for, and it is about cost rather than outcome. A rank cannot
// be a `where`, and the answer taken was to read every contract and drop most of them in
// JavaScript — so the list cost what the workspace held rather than what the reader was shown.
test('a rank-filtered list reads what it shows rather than the whole table', async () => {
	const reads: StatementRead[] = [];
	const api = await createApi({ onStatement: (sql, rowCount) => reads.push({ sql, rowCount }) });
	const { overdueGovIds } = await seedWorkspaceWithFewOverdue(api);

	reads.length = 0;
	const overdue = await api.contract.getMany({ rank: 'overdue' });

	assert.deepEqual(overdue.map((contract) => contract.govId).sort(), [...overdueGovIds].sort());

	// a handful of slack rather than an exact figure: the bounds narrow to a superset of the
	// rank by construction, and pinning the superset would fail on a fixture that widened it
	// without the cost changing in any way a reader would notice.
	const read = contractListRead(reads);

	assert.ok(
		read.rowCount <= overdue.length + 10,
		`the list read ${read.rowCount} rows to show ${overdue.length}`
	);
});

// The other half of the same claim: nothing above narrowed the list that asked for no rank,
// which still answers with the whole workspace and still costs what that is.
test('a list that asks for no rank still reads the whole table', async () => {
	const reads: StatementRead[] = [];
	const api = await createApi({ onStatement: (sql, rowCount) => reads.push({ sql, rowCount }) });
	await seedWorkspaceWithFewOverdue(api);

	reads.length = 0;
	const all = await api.contract.getMany({});

	assert.equal(all.length, 1003);
	assert.equal(contractListRead(reads).rowCount, 1003);
});

/** the identities out of what a multi-record action reported it changed. */
const toIds = (contracts: readonly { id: string }[]) => contracts.map((contract) => contract.id);

test('several contracts are terminated by one action', async () => {
	const api = await createApi();
	const first = await seedContract(api);
	const second = await seedContract(api);
	const third = await seedContract(api);

	const result = await api.contract.terminateMany({ ids: [first.id, second.id, third.id] });

	assert.deepEqual(toIds(result.terminated).sort(), [first.id, second.id, third.id].sort());
	assert.deepEqual(result.refused, []);

	for (const id of [first.id, second.id, third.id]) {
		assert.equal((await api.contract.get({ id }))?.status, 'terminated');
	}
});

// the assertion the ticket exists for, and it is about cost rather than outcome: terminating
// three contracts one at a time and terminating them together leave the same three rows, and
// differ by two reconcile passes — which over a wire is a round trip per changed row.
test('terminating many reconciles once, not once per record', async () => {
	const ids: string[] = [];
	const oneByOne = await withStatementLog(async (api, drain) => {
		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedContract(api)).id);
		}

		drain();

		for (const id of ids) {
			await api.contract.terminate({ id });
		}
	});

	const together = await withStatementLog(async (api, drain) => {
		const seeded = [];

		for (let index = 0; index < 3; index += 1) {
			seeded.push((await seedContract(api)).id);
		}

		drain();

		await api.contract.terminateMany({ ids: seeded });
	});

	// the reconcile pass reads the contracts it is about; one pass reads them once.
	const passesOneByOne = countMatching(oneByOne, /select .* from "contract" where/i);
	const passesTogether = countMatching(together, /select .* from "contract" where/i);

	assert.ok(
		passesTogether < passesOneByOne,
		`one action should read less than three: ${passesTogether} against ${passesOneByOne}`
	);
	assert.ok(
		together.length < oneByOne.length,
		`one action should cost fewer statements: ${together.length} against ${oneByOne.length}`
	);
});

// a selection is assembled by eye, so some of it being ineligible is ordinary. The rest must
// still be applied, and the reader must be told which ones were not.
test('a contract that cannot be terminated is named, and the rest still are', async () => {
	const api = await createApi();
	const terminable = await seedContract(api);
	const already = await seedContract(api);

	await api.contract.terminate({ id: already.id });

	const result = await api.contract.terminateMany({ ids: [terminable.id, already.id] });

	assert.deepEqual(toIds(result.terminated), [terminable.id]);
	assert.deepEqual(
		result.refused.map((entry) => entry.id),
		[already.id]
	);
	assert.equal(result.refused[0].reason, 'not-terminable');
	assert.equal((await api.contract.get({ id: terminable.id }))?.status, 'terminated');
});

test('an id that names no contract is refused as missing rather than failing the action', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const missing = unusedId();
	const result = await api.contract.terminateMany({ ids: [contract.id, missing] });

	assert.deepEqual(toIds(result.terminated), [contract.id]);
	assert.deepEqual(
		result.refused.map((entry) => ({ id: entry.id, reason: entry.reason })),
		[{ id: missing, reason: 'missing' }]
	);
});

// undoing a bulk action reverses all of it: the inverse is built from what the procedure
// reported it changed, so it puts back exactly those and nothing it refused.
test('un-terminating many puts every one of them back', async () => {
	const api = await createApi();
	const first = await seedContract(api);
	const second = await seedContract(api);

	const terminated = await api.contract.terminateMany({ ids: [first.id, second.id] });
	const restored = await api.contract.unterminateMany({ ids: toIds(terminated.terminated) });

	assert.deepEqual(toIds(restored.unterminated).sort(), [first.id, second.id].sort());

	for (const id of [first.id, second.id]) {
		const putBack = await api.contract.get({ id });

		assert.ok(putBack);
		assert.notEqual(putBack.status, 'terminated');
	}
});

test('and it recomputes each status rather than putting back the one it held', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.terminateMany({ ids: [contract.id] });
	await api.contract.unterminateMany({ ids: [contract.id] });

	const restored = await api.contract.get({ id: contract.id });
	const untouched = await seedContract(api);
	const neverTerminated = await api.contract.get({ id: untouched.id });

	// the same fixture, never terminated: whatever the domain derives for one it derives for
	// the other, which is what "recomputed" means here.
	assert.ok(restored);
	assert.ok(neverTerminated);
	assert.equal(restored.status, neverTerminated.status);
});

test('terminating the same contract twice in one selection acts on it once', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const result = await api.contract.terminateMany({ ids: [contract.id, contract.id] });

	assert.deepEqual(toIds(result.terminated), [contract.id]);
	assert.deepEqual(result.refused, []);
});

// --- What a selection would do -------------------------------------------------------

/**
 * A contract nothing may be done to, and one of each thing that stops it.
 *
 * Deliberately not a single fixture with a flag: what refuses a contract differs by action, and
 * a test that seeded the union of them would pass for the wrong reason.
 */
async function seedContractHoldingAUnit(api: Api, label: string) {
	const contract = await seedContract(api);
	const { unit } = await seedComplexWithUnit(api, label);

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	return contract;
}

async function seedContractCarryingAPayment(api: Api) {
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	return contract;
}

test('a plan says which of a selection would go through and which would not', async () => {
	const api = await createApi();
	const terminable = await seedContract(api);
	const already = await seedContract(api);
	const missing = unusedId();

	await api.contract.terminate({ id: already.id });

	const plan = await api.contract.planMany({
		ids: [terminable.id, already.id, missing],
		action: 'terminate'
	});

	assert.deepEqual(plan.eligible, [terminable.id]);
	assert.deepEqual(
		plan.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[
			{ id: already.id, reason: 'not-terminable' },
			{ id: missing, reason: 'missing' }
		]
	);
});

// the criterion this ticket exists for on the read side: a contract row carries its status and
// how many payments it has, and neither of those answers what a deletion is refused for. A row
// could not have said this, which is why the confirmation asks instead of reading the list.
test('a plan answers for a rule no row on the list carries', async () => {
	const api = await createApi();
	const holdingUnits = await seedContractHoldingAUnit(api, 'S1');
	const carryingPayments = await seedContractCarryingAPayment(api);
	const free = await seedContract(api);

	const plan = await api.contract.planMany({
		ids: [holdingUnits.id, carryingPayments.id, free.id],
		action: 'delete'
	});

	assert.deepEqual(plan.eligible, [free.id]);
	assert.deepEqual(
		plan.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[
			{ id: holdingUnits.id, reason: 'holds-units' },
			{ id: carryingPayments.id, reason: 'holds-payments' }
		]
	);
});

// dismissing the confirmation has to leave the workspace exactly as it was, and the reason it
// does is structural rather than careful: asking is a read.
test('asking what an action would do writes nothing', async () => {
	const api = await createApi();
	const first = await seedContract(api);
	const second = await seedContractHoldingAUnit(api, 'S2');

	const statements: string[] = [];
	const planning = await createApi({ onStatement: (sql) => statements.push(sql) });
	const planned = await seedContract(planning);

	statements.splice(0, statements.length);

	await planning.contract.planMany({ ids: [planned.id], action: 'delete' });

	assert.equal(countMatching(statements, /^\s*(insert|update|delete)/i), 0);

	for (const action of ['terminate', 'restore', 'delete'] as const) {
		await api.contract.planMany({ ids: [first.id, second.id], action });
	}

	assert.equal((await api.contract.get({ id: first.id }))?.status, 'active');
	assert.ok(await api.contract.get({ id: second.id }));
});

// the property the whole design rests on: the confirmation shows what the mutation is about to
// decide, not a second opinion about it. Both go through one call, so this can only fail if
// somebody gives one of them its own rule.
test('a plan and the action it precedes refuse exactly the same contracts', async () => {
	for (const action of ['terminate', 'restore', 'delete'] as const) {
		const api = await createApi();
		const plain = await seedContract(api);
		const terminated = await seedContract(api);
		const holdingUnits = await seedContractHoldingAUnit(api, `S3-${action}`);
		const missing = unusedId();

		await api.contract.terminate({ id: terminated.id });

		const ids = [plain.id, terminated.id, holdingUnits.id, missing];
		const plan = await api.contract.planMany({ ids, action });

		const acted =
			action === 'terminate'
				? await api.contract.terminateMany({ ids })
				: action === 'restore'
					? await api.contract.unterminateMany({ ids })
					: await api.contract.deleteMany({ ids });

		assert.deepEqual(
			acted.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
			plan.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
			`${action} refuses what its plan said it would`
		);

		// and every contract named is accounted for one way or the other. Without this a
		// mutation could quietly drop records into neither answer and still agree about the
		// ones it refused.
		const changed =
			'terminated' in acted
				? acted.terminated
				: 'unterminated' in acted
					? acted.unterminated
					: acted.deleted;

		assert.deepEqual(
			[...toIds(changed), ...acted.refused.map((refusal) => refusal.id)].sort(),
			[...ids].sort(),
			`${action} says what became of every contract it was given`
		);
	}
});

// another device writes between the plan and the action. The mutation is authoritative, so what
// it reports is what happened — the plan is not replayed and nothing is retried.
test('what the action refuses is what happened, not what the plan showed', async () => {
	const api = await createApi();
	const first = await seedContract(api);
	const second = await seedContract(api);

	const plan = await api.contract.planMany({
		ids: [first.id, second.id],
		action: 'terminate'
	});

	assert.deepEqual(plan.eligible.sort(), [first.id, second.id].sort());

	// the workspace moves under the open confirmation.
	await api.contract.terminate({ id: second.id });

	const acted = await api.contract.terminateMany({ ids: [first.id, second.id] });

	assert.deepEqual(toIds(acted.terminated), [first.id]);
	assert.deepEqual(
		acted.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: second.id, reason: 'not-terminable' }]
	);
});

test('several contracts are deleted by one action, and the rest are named', async () => {
	const api = await createApi();
	const first = await seedContract(api);
	const second = await seedContract(api, { govId: 'CT-DEL-2' });
	const holdingUnits = await seedContractHoldingAUnit(api, 'S4');

	const result = await api.contract.deleteMany({
		ids: [first.id, second.id, holdingUnits.id]
	});

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(
		result.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: holdingUnits.id, reason: 'holds-units' }]
	);
	assert.equal(await api.contract.get({ id: first.id }), undefined);
	assert.ok(await api.contract.get({ id: holdingUnits.id }));
	// the government id comes back with the row, which is what names the record afterwards.
	assert.ok(result.deleted.some((contract) => contract.govId === 'CT-DEL-2'));
});

test('restoring many puts back the terminated ones and names the rest', async () => {
	const api = await createApi();
	const terminated = await seedContract(api);
	const never = await seedContract(api);

	await api.contract.terminate({ id: terminated.id });

	const result = await api.contract.unterminateMany({ ids: [terminated.id, never.id] });

	assert.deepEqual(toIds(result.unterminated), [terminated.id]);
	assert.deepEqual(
		result.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: never.id, reason: 'not-restorable' }]
	);
});

// the cost assertion, for the two actions the termination test does not cover. Restoring reads
// the set once and reconciles once; deleting reconciles not at all, because a contract that can
// be deleted holds nothing derived.
test('restoring many reconciles once, not once per record', async () => {
	const oneByOne = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedContract(api)).id);
		}

		await api.contract.terminateMany({ ids });
		drain();

		for (const id of ids) {
			await api.contract.unterminate({ id });
		}
	});

	const together = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedContract(api)).id);
		}

		await api.contract.terminateMany({ ids });
		drain();

		await api.contract.unterminateMany({ ids });
	});

	assert.ok(
		together.length < oneByOne.length,
		`one action should cost fewer statements: ${together.length} against ${oneByOne.length}`
	);
});

test('deleting many issues one delete rather than one per record', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedContract(api)).id);
		}

		drain();

		await api.contract.deleteMany({ ids });
	});

	assert.equal(countMatching(statements, /^\s*delete from "contract"/i), 1);
});

// --- Putting a deleted selection back ------------------------------------------------

test('a deleted selection is put back whole, each contract with the identity it had', async () => {
	const api = await createApi();
	const first = await seedContract(api, { govId: 'CT-BACK-1' });
	const second = await seedContract(api, { govId: 'CT-BACK-2' });

	const deleted = await api.contract.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.contract.createMany({ contracts: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await api.contract.get({ id: original.id });

		assert.ok(back, 'the contract is there under the identity it had');
		assert.equal(back.govId, original.govId);
		assert.equal(back.tenantId, original.tenantId);
		assert.equal(back.cost, original.cost);
	}
});

// all or nothing, and the reason: a set half restored is a workspace in a shape neither the
// deletion nor the undo describes. The reader is told which one blocked it, by name.
test('and where one of them cannot be put back, none is', async () => {
	const api = await createApi();
	const first = await seedContract(api, { govId: 'CT-BLOCK-1' });
	const second = await seedContract(api, { govId: 'CT-BLOCK-2' });

	const deleted = await api.contract.deleteMany({ ids: [first.id, second.id] });

	// somebody takes one of the government ids while the deletion is on the undo stack.
	await seedContract(api, { govId: 'CT-BLOCK-2' });

	await assert.rejects(
		() => api.contract.createMany({ contracts: deleted.deleted }),
		/CT-BLOCK-2/,
		'the refusal names the contract that blocked it'
	);

	assert.equal(await api.contract.get({ id: first.id }), undefined);
	assert.equal(await api.contract.get({ id: second.id }), undefined);
});

test('and a set claiming one government id twice is refused before anything is written', async () => {
	const api = await createApi();
	const first = await seedContract(api, { govId: 'CT-TWICE' });
	const second = await seedContract(api);

	const deleted = await api.contract.deleteMany({ ids: [first.id, second.id] });
	const collided = deleted.deleted.map((contract) => ({ ...contract, govId: 'CT-TWICE' }));

	await assert.rejects(() => api.contract.createMany({ contracts: collided }), /CT-TWICE/);

	assert.equal(await api.contract.get({ id: first.id }), undefined);
	assert.equal(await api.contract.get({ id: second.id }), undefined);
});

test('putting a selection back is one batch and one reconcile pass', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedContract(api)).id);
		}

		const deleted = await api.contract.deleteMany({ ids });

		drain();

		await api.contract.createMany({ contracts: deleted.deleted });
	});

	// three rows, and the reconcile that follows reads them once rather than three times.
	assert.equal(countMatching(statements, /^\s*insert into "contract"/i), 3);
	assert.ok(
		countMatching(statements, /select .* from "contract" where/i) <= 3,
		`one pass over the set, not one per row: ${statements.filter((sql) => /select .* from "contract" where/i.test(sql)).length}`
	);
});
