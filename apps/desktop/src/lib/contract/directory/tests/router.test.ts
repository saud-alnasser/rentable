import assert from 'node:assert/strict';
import test from 'node:test';

import { sql } from 'drizzle-orm';

import {
	type Api,
	createApi,
	identityWithout,
	monthsFromNow,
	refusedWith,
	seedTenant,
	unusedId
} from '$lib/app/tests/testing.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import type { ContractSortColumnId } from '$lib/contract/contract.ts';
import type { ContractRank } from '$lib/contract/rank/rank.ts';
import type { ListSort } from '@rentable/design/sort.ts';
import {
	RENEWAL_WITHDRAWALS,
	seedComplexWithUnit,
	seedContract,
	seedRenewedEndingSoon,
	withdrawRenewal
} from '$lib/contract/tests/seed.ts';

/** the sort a contracts list may be asked for, as the procedure states it. */
type ContractSort = NonNullable<NonNullable<Parameters<Api['contract']['getMany']>[0]>['sort']>;

// --- Payment aggregates on reads -------------------------------------------------------

test('the contract list carries the payment aggregates after a payment', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.payment.create({
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

	await api.payment.create({ contractId: paid.id, date: monthsFromNow(0), amount: 100 });
	await api.payment.create({ contractId: paid.id, date: monthsFromNow(0), amount: 200 });

	const contracts = await api.contract.getMany({});
	const listed = (id: string) => contracts.find((candidate) => candidate.id === id);

	assert.equal(listed(paid.id)?.paymentCount, 2);
	// a contract nobody has paid is counted as zero rather than dropped from the list — the
	// count rides the row, so a missing one would be a contract missing from the directory.
	assert.equal(listed(untouched.id)?.paymentCount, 0);
});

// effort 854, criterion 27. Recording a refund is ticket 22's, so the refund is seeded as the row
// it is stored as, and the whole-table reconcile a pull runs settles the contract against it.
async function seedRefund(
	db: ReturnType<typeof createMemoryDatabase>,
	contractId: string,
	amount: number
) {
	await db.run(
		sql`insert into payment (id, date, amount, contract_id, direction) values (${unusedId()}, ${monthsFromNow(0)}, ${amount}, ${contractId}, 'refund')`
	);
}

test('after a refund a contract reads as though it had received the net: paid, status, schedule and rank', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const refunded = await seedContract(api);
	const net = await seedContract(api);

	await api.payment.create({ contractId: refunded.id, date: monthsFromNow(0), amount: 1000 });
	await api.payment.create({ contractId: net.id, date: monthsFromNow(0), amount: 600 });
	await seedRefund(db, refunded.id, 400);
	await api.contract.reconcile();

	const contracts = await api.contract.getMany({});
	const listed = (id: string) => contracts.find((candidate) => candidate.id === id);

	assert.equal(listed(refunded.id)?.paidAmount, 600);
	assert.equal(listed(refunded.id)?.status, listed(net.id)?.status);
	assert.equal(listed(refunded.id)?.rank, listed(net.id)?.rank);
	assert.ok(listed(net.id)?.rank, 'a contract owing 400 of a cycle already due is ranked');
	assert.deepEqual(
		(await api.contract.schedule({ id: refunded.id })).map((cycle) => [cycle.state, cycle.covered]),
		(await api.contract.schedule({ id: net.id })).map((cycle) => [cycle.state, cycle.covered])
	);
	// a refund is money going out, not a payment received, so the card counts the one payment.
	assert.equal(listed(refunded.id)?.paymentCount, 1);
});

test('a terminated contract refunded in full stays terminated and owes nothing', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const contract = await seedContract(api);

	await api.payment.create({ contractId: contract.id, date: monthsFromNow(0), amount: 600 });
	await api.contract.terminate({ id: contract.id });
	await seedRefund(db, contract.id, 600);
	await api.contract.reconcile();

	const listed = (await api.contract.getMany({})).find((candidate) => candidate.id === contract.id);

	assert.equal(listed?.status, 'terminated');
	assert.equal(listed?.paidAmount, 0);
	assert.equal(listed?.rank, undefined);
	assert.deepEqual(
		(await api.contract.schedule({ id: contract.id })).filter(
			(cycle) => cycle.state === 'late' || cycle.state === 'due'
		),
		[]
	);
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

test('the contract list names the units each contract holds, in one read', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Named Court', location: 'Riyadh' });
	const tenth = await api.complex.units.create({ name: 'Room 10', complexId: complex.id });
	const second = await api.complex.units.create({ name: 'Room 2', complexId: complex.id });
	const held = await seedContract(api, { unitIds: [tenth.id, second.id] });
	const empty = await seedContract(api);

	const contracts = await api.contract.getMany({});
	const listed = (id: string) => contracts.find((candidate) => candidate.id === id);

	// in the order a reader counts them, so Room 2 comes before Room 10 rather than after it.
	assert.deepEqual(listed(held.id)?.unitNames, ['Room 2', 'Room 10']);
	// a contract holding nothing is still listed, with no names rather than missing from the list.
	assert.deepEqual(listed(empty.id)?.unitNames, []);
	// read through the assignment table without multiplying the contract into a row per unit.
	assert.equal(contracts.filter((contract) => contract.id === held.id).length, 1);
});

test('without viewing units, a contract row names no unit', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const { unit } = await seedComplexWithUnit(api, 'Hidden');
	const contract = await seedContract(api, { unitIds: [unit.id] });
	const lacking = await createApi({ db, identity: identityWithout('viewUnit') });

	const [everything] = await api.contract.getMany({});
	assert.deepEqual(everything?.unitNames, ['Unit Hidden'], 'the row named no unit to leave out');

	// the contract is still listed; only what it holds goes unnamed (effort 846, requirement 19).
	const [row] = await lacking.contract.getMany({});
	assert.equal(row?.id, contract.id);
	assert.equal('unitNames' in row!, false);
});

test('the payment count follows a deleted payment back down', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const payment = await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 100
	});

	await api.payment.delete({ id: payment.id });

	const listed = (await api.contract.getMany({})).find((candidate) => candidate.id === contract.id);

	assert.equal(listed?.paymentCount, 0);
});

test('every row of the contracts list carries its rank, asked for one or not', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	const ranks = Object.fromEntries(
		(await api.contract.getMany({})).map((contract) => [contract.govId, contract.rank])
	);

	assert.deepEqual(ranks, {
		'RANK-OVERDUE': 'overdue',
		'RANK-OWING': 'owing',
		'RANK-ENDING': 'ending-soon',
		'RANK-DUE-SOON': 'due-soon',
		'RANK-NONE': undefined
	});
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

	await api.payment.create({
		contractId: expired.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	const terminated = await seedContract(api, { govId: 'GOV-TERMINATED' });

	await api.contract.terminate({ id: terminated.id });

	const active = await seedContract(api, { govId: 'GOV-ACTIVE' });
	const fulfilled = await seedContract(api, { govId: 'GOV-FULFILLED' });

	await api.payment.create({
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
	const payment = await api.payment.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1234
	});

	const found = await api.payment.search({ term: '1234' });

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
	await api.payment.create({
		contractId: ending.id,
		amount: 100,
		date: monthsFromNow(-2)
	});

	// starts in three days, so its first cycle falls due inside the week and nothing covers it.
	await api.contract.create({
		govId: 'RANK-DUE-SOON',
		cost: 1500,
		start: monthsFromNow(0, 3),
		end: monthsFromNow(12, 2),
		interval: '12m',
		tenantId: tenant.id
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
	assert.deepEqual(await govIds('due-soon'), ['RANK-DUE-SOON']);
	assert.deepEqual(await govIds('ending-soon'), ['RANK-ENDING']);
});

test('asking for no rank answers with every contract, ranked or not', async () => {
	const api = await createApi();
	await seedRankedPortfolio(api);

	const all = await api.contract.getMany({});

	assert.equal(all.length, 5);
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

// inside due soon the rank's own order is the soonest due first, whatever order they were made in.
test('the due-soon rank answers soonest due first', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = (govId: string, inDays: number) =>
		api.contract.create({
			govId,
			cost: 1000,
			start: monthsFromNow(0, inDays),
			end: monthsFromNow(12, inDays - 1),
			interval: '12m',
			tenantId: tenant.id
		});

	await contract('IN-FIVE-DAYS', 5);
	await contract('IN-TWO-DAYS', 2);
	await contract('IN-NINE-DAYS', 9);

	assert.deepEqual(
		(await api.contract.getMany({ rank: 'due-soon' })).map((c) => c.govId),
		['IN-TWO-DAYS', 'IN-FIVE-DAYS']
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

// twelve payments of 4166.67 sum to a hair under twelve times 4166.67, so the paid amount passes
// the SQL bound and the rank is what drops the contract: float dust is not a debt.
test('a contract paid in full is in neither money rank and has nothing to be reminded of', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const contract = async (govId: string, months: number) => {
		const created = await api.contract.create({
			govId,
			cost: 4166.67,
			start: monthsFromNow(months),
			end: monthsFromNow(months + 12, -1),
			interval: '1m',
			tenantId: tenant.id
		});

		for (let cycle = 0; cycle < 12; cycle++) {
			await api.payment.create({
				contractId: created.id,
				amount: 4166.67,
				date: monthsFromNow(months + cycle)
			});
		}

		return created;
	};

	// every cycle has fallen due, one inside its term and one past its end
	const inside = await contract('PAID-INSIDE', -11);
	const past = await contract('PAID-PAST', -13);

	assert.deepEqual(await api.contract.getMany({ rank: 'owing' }), []);
	assert.deepEqual(await api.contract.getMany({ rank: 'overdue' }), []);

	for (const { id } of [inside, past]) {
		await assert.rejects(
			() => api.contract.reminder({ id }),
			refusedWith('contract.nothingToRemind')
		);
	}
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

		await api.payment.create({
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

// --- A renewed contract, effort 861 requirement 7 --------------------------------------
//
// a contract a standing successor renews is not up for renewal: the directory's ending-soon rank
// leaves it out, and its row says it is renewed, which the renew act reads. A successor deleted,
// terminated or retired by a merge no longer stands, and the contract is up for renewal again.

test('a renewed contract inside its notice window is in no ending-soon list', async () => {
	const { api, contract, successor } = await seedRenewedEndingSoon();
	const row = async (id: string) =>
		(await api.contract.getMany({})).find((candidate) => candidate.id === id);

	assert.deepEqual(await api.contract.getMany({ rank: 'ending-soon' }), []);
	assert.equal((await row(contract.id))?.renewed, true);
	assert.equal((await row(contract.id))?.rank, undefined);
	assert.equal((await row(successor.id))?.renewed, false);
	// a list narrowed to the contract's tenant reads it the same way
	assert.equal(
		(await api.contract.getMany({ tenantId: contract.tenantId })).find(
			(candidate) => candidate.id === contract.id
		)?.renewed,
		true
	);
});

for (const how of RENEWAL_WITHDRAWALS) {
	test(`a contract whose renewal was ${how} is in the ending-soon list again`, async () => {
		const seeded = await seedRenewedEndingSoon();
		const { api, contract, successor } = seeded;

		await withdrawRenewal(seeded, successor.id, how);

		const endingSoon = await api.contract.getMany({ rank: 'ending-soon' });

		assert.deepEqual(
			endingSoon.map((listed) => listed.id),
			[contract.id]
		);
		assert.equal(endingSoon[0].renewed, false);
		assert.equal(endingSoon[0].rank, 'ending-soon');
	});
}
