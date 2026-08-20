import assert from 'node:assert/strict';
import test from 'node:test';

import {
	NOW,
	type Api,
	countMatching,
	createApi,
	monthsFromNow,
	seedTenant,
	unusedId,
	withStatementLog
} from '$lib/api/tests/testing.ts';

/** What `contract.create` takes — read off the procedure, so a fixture cannot drift from it. */
type ContractInput = Parameters<Api['contract']['create']>[0];

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

test('the ledger lists every payment of its contract, newest first', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const older = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(-2),
		amount: 300
	});
	const newer = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[newer.id, older.id]
	);
});

test('payments made on one day are listed with the most recently recorded first', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const date = monthsFromNow(0);

	const first = await api.contract.payments.create({ contractId: contract.id, date, amount: 100 });
	const second = await api.contract.payments.create({ contractId: contract.id, date, amount: 200 });

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[second.id, first.id]
	);
});

test('a ledger holds only the payments of its own contract', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const other = await seedContract(api, { cost: 100000 });

	await api.contract.payments.create({
		contractId: other.id,
		date: monthsFromNow(0),
		amount: 700
	});
	const own = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[own.id]
	);
});

test('a ledger search matches an amount', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const matching = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1250
	});
	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(-1),
		amount: 400
	});

	const ledger = await api.contract.payments.getMany({ contractId: contract.id, search: '125' });

	assert.deepEqual(
		ledger.map((payment) => payment.id),
		[matching.id]
	);
});

test('a ledger search matches the day a payment was made', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const matching = await api.contract.payments.create({
		contractId: contract.id,
		date: Date.UTC(2026, 2, 20),
		amount: 500
	});
	await api.contract.payments.create({
		contractId: contract.id,
		date: Date.UTC(2026, 3, 20),
		amount: 500
	});

	const byMonth = await api.contract.payments.getMany({
		contractId: contract.id,
		search: '2026-03'
	});
	const byDay = await api.contract.payments.getMany({
		contractId: contract.id,
		search: '2026-03-20'
	});

	assert.deepEqual(
		byMonth.map((payment) => payment.id),
		[matching.id]
	);
	assert.deepEqual(
		byDay.map((payment) => payment.id),
		[matching.id]
	);
});

test('a ledger search reads a wildcard as text, not as a pattern', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	assert.deepEqual(
		await api.contract.payments.getMany({ contractId: contract.id, search: '%' }),
		[]
	);
	assert.deepEqual(
		await api.contract.payments.getMany({ contractId: contract.id, search: '_' }),
		[]
	);
});

test('a payment is read with the contract it was made against', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { govId: 'PAY-1' });
	const created = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const payment = await api.contract.payments.get({ id: created.id });

	assert.ok(payment, 'the payment just created reads back');
	assert.equal(payment.id, created.id);
	assert.equal(payment.amount, 500);
	assert.equal(payment.contractId, contract.id);
	// the context a payment cannot be read without: three figures and no way back is not a view
	assert.equal(payment.contractGovId, 'PAY-1');
	assert.equal(payment.contractStatus, contract.status);
	assert.ok(payment.tenantName);
});

test('reading a payment that does not exist answers with nothing rather than failing', async () => {
	const api = await createApi();

	assert.equal(await api.contract.payments.get({ id: unusedId() }), undefined);
});

test('recording a payment increases the contract paid amount', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	const reloaded = await api.contract.get({ id: contract.id });

	assert.ok(reloaded, 'the contract the payment was made against reads back');
	assert.equal(reloaded.paidAmount, 500);
});

test('a payment against a missing contract is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.contract.payments.create({
				contractId: unusedId(),
				date: monthsFromNow(0),
				amount: 500
			}),
		/contract does not exist/
	);
});

test('a non-positive payment is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.payments.create({ contractId: contract.id, date: monthsFromNow(0), amount: 0 }),
		/payment amount must be greater than zero/
	);
});

test('a payment is rejected once the contract is fully paid', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	await assert.rejects(
		() =>
			api.contract.payments.create({ contractId: contract.id, date: monthsFromNow(0), amount: 1 }),
		/fully paid/
	);
});

test('a payment dated after today is rejected', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	await assert.rejects(
		() =>
			api.contract.payments.create({
				contractId: contract.id,
				date: monthsFromNow(0, 1),
				amount: 500
			}),
		/cannot be dated in the future/
	);
});

test('a payment dated today is taken', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const created = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	assert.equal(created.date, monthsFromNow(0));
});

test('a payment cannot be moved into the future by an edit', async () => {
	const api = await createApi();
	const contract = await seedContract(api);

	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 500
	});

	await assert.rejects(
		() => api.contract.payments.update({ id: payment.id, date: monthsFromNow(0, 1), amount: 500 }),
		/cannot be dated in the future/
	);
});

/**
 * The days a period covers, computed from the harness's fixed clock the same way the router
 * computes them — so a test says *the first of last month* rather than a literal date that is
 * only correct on the day it was written.
 */
function dayOf(monthOffset: number, day: number) {
	const base = new Date(NOW);

	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, day);
}

/** the last day of the month `monthOffset` away, which is day zero of the one after it. */
function lastDayOf(monthOffset: number) {
	return dayOf(monthOffset + 1, 0);
}

// the criterion this ticket exists for, and it is asserted at the router rather than at the
// rendered list: a filter that shortened the loaded set would pass any assertion made against
// what is on screen, which is exactly the thing being forbidden.
test('a period narrows which payments the read returns', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const lastMonth = await api.contract.payments.create({
		contractId: contract.id,
		date: dayOf(-1, 1),
		amount: 300
	});
	const thisMonth = await api.contract.payments.create({
		contractId: contract.id,
		date: dayOf(0, 1),
		amount: 500
	});

	const all = await api.contract.payments.getMany({ contractId: contract.id });
	const narrowed = await api.contract.payments.getMany({
		contractId: contract.id,
		period: 'last-month'
	});

	assert.deepEqual(
		all.map((payment) => payment.id).sort(),
		[lastMonth.id, thisMonth.id].sort(),
		'both payments exist'
	);
	assert.deepEqual(
		narrowed.map((payment) => payment.id),
		[lastMonth.id]
	);
});

// the boundary the half-open upper bound exists for: a payment stored with a time of day on the
// last day of the period is still inside it, and one on the first day of the next is not.
test('a period includes the whole of its last day and none of the next', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const lastInstant = await api.contract.payments.create({
		contractId: contract.id,
		date: lastDayOf(-1) + 23 * 60 * 60 * 1000,
		amount: 100
	});
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 1), amount: 200 });

	const narrowed = await api.contract.payments.getMany({
		contractId: contract.id,
		period: 'last-month'
	});

	assert.deepEqual(
		narrowed.map((payment) => payment.id),
		[lastInstant.id]
	);
});

test('a period and a search narrow together rather than one replacing the other', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	const wanted = await api.contract.payments.create({
		contractId: contract.id,
		date: dayOf(-1, 2),
		amount: 777
	});
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 3), amount: 888 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 2), amount: 777 });

	const narrowed = await api.contract.payments.getMany({
		contractId: contract.id,
		search: '777',
		period: 'last-month'
	});

	assert.deepEqual(
		narrowed.map((payment) => payment.id),
		[wanted.id]
	);
});

test('no period returns the whole ledger, so an unset filter narrows nothing', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	await api.contract.payments.create({ contractId: contract.id, date: dayOf(-1, 4), amount: 100 });
	await api.contract.payments.create({ contractId: contract.id, date: dayOf(0, 4), amount: 200 });

	const ledger = await api.contract.payments.getMany({ contractId: contract.id });

	assert.equal(ledger.length, 2);
});

// --- What a selection would do -------------------------------------------------------
//
// The plan and the deletion go through one call, so they cannot answer differently about
// what a refusal is. What they can differ about is the workspace, and on this list that is
// the whole of the interesting case: the ledger withholds its controls on a terminated
// contract, so the only way to reach that refusal is for the termination to arrive while
// the confirmation is open.

/** the identities out of what a multi-record action reported it changed. */
const toIds = (payments: readonly { id: string }[]) => payments.map((payment) => payment.id);

async function seedPayment(api: Api, contractId: string, amount: number) {
	return api.contract.payments.create({ contractId, date: monthsFromNow(-1), amount });
}

test('a plan says how many payments would go through, and names no refusal', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);

	const plan = await api.contract.payments.planMany({ ids: [first.id, second.id] });

	assert.deepEqual(plan.eligible, [first.id, second.id]);
	assert.deepEqual(plan.refused, []);
});

test('and a payment no longer in the workspace is refused rather than counted', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const held = await seedPayment(api, contract.id, 300);
	const gone = unusedId();

	const plan = await api.contract.payments.planMany({ ids: [held.id, gone] });

	assert.deepEqual(plan.eligible, [held.id]);
	// nothing survived to name it by, so the count against the reason is what carries it.
	assert.deepEqual(plan.refused, [{ id: gone, amount: 0, reason: 'missing' }]);
});

test('asking what a deletion would do writes nothing', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const payment = await seedPayment(api, contract.id, 300);

	await api.contract.payments.planMany({ ids: [payment.id] });

	assert.equal((await api.contract.payments.getMany({ contractId: contract.id })).length, 1);
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 300);
});

// the rule the ticket and the spec both said did not exist. The ledger hides its controls on
// a terminated contract, so this is what the reader meets when the termination lands while
// the confirmation is already open.
test('a payment on a terminated contract is refused, by the plan and by the deletion alike', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const payment = await seedPayment(api, contract.id, 300);

	await api.contract.terminate({ id: contract.id });

	const plan = await api.contract.payments.planMany({ ids: [payment.id] });

	assert.deepEqual(plan.eligible, []);
	assert.deepEqual(plan.refused, [{ id: payment.id, amount: 300, reason: 'contract-terminated' }]);

	const result = await api.contract.payments.deleteMany({ ids: [payment.id] });

	assert.deepEqual(result.deleted, []);
	assert.deepEqual(result.refused, plan.refused);
	assert.equal((await api.contract.payments.getMany({ contractId: contract.id })).length, 1);
});

// the plan is what the reader agreed to, and the deletion is what happened. Where the
// workspace moved in between, the second is the answer.
test('what the deletion refuses is what happened, not what the plan showed', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const payment = await seedPayment(api, contract.id, 300);

	const plan = await api.contract.payments.planMany({ ids: [payment.id] });
	assert.deepEqual(plan.eligible, [payment.id]);

	// somebody else terminates the contract while the confirmation is open.
	await api.contract.terminate({ id: contract.id });

	const result = await api.contract.payments.deleteMany({ ids: [payment.id] });

	assert.deepEqual(result.deleted, []);
	assert.deepEqual(result.refused, [
		{ id: payment.id, amount: 300, reason: 'contract-terminated' }
	]);
});

test('several payments are deleted by one action, and the contract is recomputed', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);
	const kept = await seedPayment(api, contract.id, 200);

	const result = await api.contract.payments.deleteMany({ ids: [first.id, second.id] });

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(result.refused, []);
	assert.deepEqual(toIds(await api.contract.payments.getMany({ contractId: contract.id })), [
		kept.id
	]);
	// the contract's paid amount is derived from its payments, so it has to have moved.
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 200);
});

// about cost rather than outcome: a payment is what a contract's derived state is computed
// from, so N calls would cost N reconcile passes for work one pass does.
test('deleting many payments issues one delete and one reconcile pass', async () => {
	const oneByOne = await withStatementLog(async (api, drain) => {
		const contract = await seedContract(api, { cost: 100000 });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedPayment(api, contract.id, 100)).id);
		}

		drain();

		for (const id of ids) {
			await api.contract.payments.delete({ id });
		}
	});

	const together = await withStatementLog(async (api, drain) => {
		const contract = await seedContract(api, { cost: 100000 });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedPayment(api, contract.id, 100)).id);
		}

		drain();

		await api.contract.payments.deleteMany({ ids });
	});

	assert.equal(countMatching(together, /^\s*delete from "payment"/i), 1);
	assert.equal(countMatching(oneByOne, /^\s*delete from "payment"/i), 3);
	// one pass over the contract rather than one per payment removed.
	assert.ok(
		countMatching(together, /^\s*update "contract"/i) <=
			countMatching(oneByOne, /^\s*update "contract"/i) / 2,
		`one reconcile pass, not one per record: ${countMatching(together, /^\s*update "contract"/i)} against ${countMatching(oneByOne, /^\s*update "contract"/i)}`
	);
});

// --- Putting a deleted selection back ------------------------------------------------

test('a deleted selection of payments is put back whole, each with the identity it had', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);

	const deleted = await api.contract.payments.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.contract.payments.createMany({ payments: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await api.contract.payments.get({ id: original.id });

		assert.ok(back, 'the payment is there under the identity it had');
		assert.equal(back.amount, original.amount);
		assert.equal(back.date, original.date);
		assert.equal(back.contractId, contract.id);
	}

	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 800);
});

// The case asking the paid-in-full gate once per payment would have broken.
//
// The gate refuses a payment arriving at a contract that is *already* paid in full, so the
// order the three were created in never met it: each was added while the ones before it still
// left the contract short. A selection is named in the reader's order, not that one, and here
// the largest comes first, so a check applied payment by payment would find the contract full
// two thirds of the way through putting its own deletion back.
test('and a set restored in the reader own order goes back whole rather than half', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 1000 });
	const small = await seedPayment(api, contract.id, 100);
	const another = await seedPayment(api, contract.id, 100);
	const large = await seedPayment(api, contract.id, 900);

	const deleted = await api.contract.payments.deleteMany({
		ids: [large.id, small.id, another.id]
	});

	assert.deepEqual(toIds(deleted.deleted), [large.id, small.id, another.id], 'the reader order');

	const restored = await api.contract.payments.createMany({ payments: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [large.id, small.id, another.id].sort());
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 1100);
});

// all or nothing, and the reason: a set half restored is a workspace in a shape neither the
// deletion nor the undo describes.
test('and where the contract will not take them back, none is restored', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);

	const deleted = await api.contract.payments.deleteMany({ ids: [first.id, second.id] });

	// the contract is terminated while the deletion sits on the undo stack.
	await api.contract.terminate({ id: contract.id });

	await assert.rejects(
		() => api.contract.payments.createMany({ payments: deleted.deleted }),
		/terminated contracts are locked/
	);

	assert.equal((await api.contract.payments.getMany({ contractId: contract.id })).length, 0);
});

test('and a set claiming one identity twice is refused before anything is written', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);

	const deleted = await api.contract.payments.deleteMany({ ids: [first.id, second.id] });
	const [head, tail] = deleted.deleted;

	await assert.rejects(
		() => api.contract.payments.createMany({ payments: [head, { ...tail, id: head.id }] }),
		new RegExp(`two payments in this set claim ${head.id}`)
	);

	assert.equal((await api.contract.payments.getMany({ contractId: contract.id })).length, 0);
});

test('putting a selection back is one batch and one reconcile pass', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const contract = await seedContract(api, { cost: 100000 });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedPayment(api, contract.id, 100)).id);
		}

		const deleted = await api.contract.payments.deleteMany({ ids });

		drain();

		await api.contract.payments.createMany({ payments: deleted.deleted });
	});

	assert.equal(countMatching(statements, /^\s*insert into "payment"/i), 3);
	// the reconcile that follows reads the contract once rather than three times.
	assert.ok(
		countMatching(statements, /^\s*update "contract"/i) <= 1,
		`one reconcile pass, not one per row: ${countMatching(statements, /^\s*update "contract"/i)}`
	);
});
