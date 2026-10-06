import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	monthsFromNow,
	seedTenant,
	unusedId,
	withStatementLog,
	refusedWith
} from '$lib/app/tests/testing.ts';

/** What `contract.create` takes, read off the procedure, so a fixture cannot drift from it. */
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
	return api.payment.create({ contractId, date: monthsFromNow(-1), amount });
}

test('a plan says how many payments would go through, and names no refusal', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);

	const plan = await api.payment.planMany({ ids: [first.id, second.id] });

	assert.deepEqual(plan.eligible, [first.id, second.id]);
	assert.deepEqual(plan.refused, []);
});

test('and a payment no longer in the workspace is refused rather than counted', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const held = await seedPayment(api, contract.id, 300);
	const gone = unusedId();

	const plan = await api.payment.planMany({ ids: [held.id, gone] });

	assert.deepEqual(plan.eligible, [held.id]);
	// nothing survived to name it by, so the count against the reason is what carries it.
	assert.deepEqual(plan.refused, [{ id: gone, amount: 0, reason: 'missing' }]);
});

test('asking what a deletion would do writes nothing', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const payment = await seedPayment(api, contract.id, 300);

	await api.payment.planMany({ ids: [payment.id] });

	assert.equal((await api.payment.getMany({ contractId: contract.id })).length, 1);
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

	const plan = await api.payment.planMany({ ids: [payment.id] });

	assert.deepEqual(plan.eligible, []);
	assert.deepEqual(plan.refused, [{ id: payment.id, amount: 300, reason: 'contract-terminated' }]);

	const result = await api.payment.deleteMany({ ids: [payment.id] });

	assert.deepEqual(result.deleted, []);
	assert.deepEqual(result.refused, plan.refused);
	assert.equal((await api.payment.getMany({ contractId: contract.id })).length, 1);
});

// the plan is what the reader agreed to, and the deletion is what happened. Where the
// workspace moved in between, the second is the answer.
test('what the deletion refuses is what happened, not what the plan showed', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const payment = await seedPayment(api, contract.id, 300);

	const plan = await api.payment.planMany({ ids: [payment.id] });
	assert.deepEqual(plan.eligible, [payment.id]);

	// somebody else terminates the contract while the confirmation is open.
	await api.contract.terminate({ id: contract.id });

	const result = await api.payment.deleteMany({ ids: [payment.id] });

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

	const result = await api.payment.deleteMany({ ids: [first.id, second.id] });

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(result.refused, []);
	assert.deepEqual(toIds(await api.payment.getMany({ contractId: contract.id })), [kept.id]);
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
			await api.payment.delete({ id });
		}
	});

	const together = await withStatementLog(async (api, drain) => {
		const contract = await seedContract(api, { cost: 100000 });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedPayment(api, contract.id, 100)).id);
		}

		drain();

		await api.payment.deleteMany({ ids });
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

	const deleted = await api.payment.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.payment.createMany({ payments: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await api.payment.get({ id: original.id });

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

	const deleted = await api.payment.deleteMany({
		ids: [large.id, small.id, another.id]
	});

	assert.deepEqual(toIds(deleted.deleted), [large.id, small.id, another.id], 'the reader order');

	const restored = await api.payment.createMany({ payments: deleted.deleted });

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

	const deleted = await api.payment.deleteMany({ ids: [first.id, second.id] });

	// the contract is terminated while the deletion sits on the undo stack.
	await api.contract.terminate({ id: contract.id });

	await assert.rejects(
		() => api.payment.createMany({ payments: deleted.deleted }),
		refusedWith('contract.terminatedLocked')
	);

	assert.equal((await api.payment.getMany({ contractId: contract.id })).length, 0);
});

test('and a set claiming one identity twice is refused before anything is written', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const first = await seedPayment(api, contract.id, 300);
	const second = await seedPayment(api, contract.id, 500);

	const deleted = await api.payment.deleteMany({ ids: [first.id, second.id] });
	const [head, tail] = deleted.deleted;

	await assert.rejects(
		() => api.payment.createMany({ payments: [head, { ...tail, id: head.id }] }),
		refusedWith('payment.repeatedInSet', { value: head.id })
	);

	assert.equal((await api.payment.getMany({ contractId: contract.id })).length, 0);
});

test('putting a selection back is one batch and one reconcile pass', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const contract = await seedContract(api, { cost: 100000 });
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedPayment(api, contract.id, 100)).id);
		}

		const deleted = await api.payment.deleteMany({ ids });

		drain();

		await api.payment.createMany({ payments: deleted.deleted });
	});

	assert.equal(countMatching(statements, /^\s*insert into "payment"/i), 3);
	// the reconcile that follows reads the contract once rather than three times.
	assert.ok(
		countMatching(statements, /^\s*update "contract"/i) <= 1,
		`one reconcile pass, not one per row: ${countMatching(statements, /^\s*update "contract"/i)}`
	);
});

// --- Refunds in a selection ----------------------------------------------------------
//
// Effort 854, requirements 25 and 26: a refund on a terminated contract is deleted like any
// payment on a live one, while the payments it received stay locked; and on a live contract a
// selection deletes received payments only while what is left still covers its refunds.

function seedRefund(api: Api, contractId: string, amount: number) {
	return api.payment.create({
		contractId,
		date: monthsFromNow(0),
		amount,
		direction: 'refund'
	});
}

test('a selection keeps refunds covered, refusing only the payments that would leave them above what was received', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const first = await seedPayment(api, contract.id, 500);
	const second = await seedPayment(api, contract.id, 1500);

	await seedRefund(api, contract.id, 1000);

	const plan = await api.payment.planMany({ ids: [first.id, second.id] });

	// the first alone leaves 1,500 received against 1,000 returned; the second as well would leave
	// nothing against it.
	assert.deepEqual(plan.eligible, [first.id]);
	assert.deepEqual(plan.refused, [
		{ id: second.id, amount: 1500, reason: 'refunds-exceed-received' }
	]);

	const deleted = await api.payment.deleteMany({ ids: [first.id, second.id] });

	assert.deepEqual(toIds(deleted.deleted), [first.id]);
	assert.deepEqual(deleted.refused, plan.refused);
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 500);
});

test('and a selection taking the refund with it deletes every payment', async () => {
	const api = await createApi();
	const contract = await seedContract(api);
	const first = await seedPayment(api, contract.id, 500);
	const second = await seedPayment(api, contract.id, 1500);
	const returned = await seedRefund(api, contract.id, 1000);

	const plan = await api.payment.planMany({ ids: [first.id, second.id, returned.id] });

	assert.deepEqual(plan.eligible, [first.id, second.id, returned.id]);
	assert.deepEqual(plan.refused, []);
});

test('on a terminated contract a refund is deleted and put back, while a payment received stays locked', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });
	const received = await seedPayment(api, contract.id, 5000);

	await api.contract.terminate({ id: contract.id });

	const returned = await seedRefund(api, contract.id, 3000);
	const deleted = await api.payment.deleteMany({ ids: [received.id, returned.id] });

	assert.deepEqual(toIds(deleted.deleted), [returned.id]);
	assert.deepEqual(deleted.refused, [
		{ id: received.id, amount: 5000, reason: 'contract-terminated' }
	]);

	// the undo of that deletion puts the refund back on the terminated contract.
	const restored = await api.payment.createMany({ payments: deleted.deleted });

	assert.deepEqual(toIds(restored), [returned.id]);
	assert.equal(restored[0]?.direction, 'refund');
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 2000);
	assert.equal((await api.contract.get({ id: contract.id }))?.status, 'terminated');

	// a payment received is still refused there, put back or not.
	await assert.rejects(
		() =>
			api.payment.createMany({
				payments: [{ contractId: contract.id, date: monthsFromNow(0), amount: 1 }]
			}),
		refusedWith('contract.terminatedLocked')
	);
});

// ticket 40 of effort 854: putting refunds back is what undoing a bulk deletion does, and an undo
// takes a change back to the state before it (the human's ruling of 2026-10-07). So it is weighed
// only that refunds stay within what the contract received, as an undo through `payment.create` is,
// and the two undo paths agree.
test('putting refunds back is refused past what the contract received', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	await seedPayment(api, contract.id, 500);

	await assert.rejects(
		() =>
			api.payment.createMany({
				payments: [
					{ contractId: contract.id, date: monthsFromNow(0), amount: 501, direction: 'refund' }
				]
			}),
		refusedWith('contract.refundsExceedReceived')
	);
	assert.equal((await api.payment.getMany({ contractId: contract.id })).length, 1);
});

test('undoing a bulk deletion of a refund is refused once another refund took what was received', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 12000 });

	await api.payment.create({ contractId: contract.id, date: monthsFromNow(0), amount: 13000 });

	const returned = await seedRefund(api, contract.id, 1000);
	const deleted = await api.payment.deleteMany({ ids: [returned.id] });

	assert.deepEqual(toIds(deleted.deleted), [returned.id]);

	await api.contract.terminate({ id: contract.id });
	await seedRefund(api, contract.id, 13000);

	await assert.rejects(
		() => api.payment.createMany({ payments: deleted.deleted }),
		refusedWith('contract.refundsExceedReceived')
	);

	const after = await api.contract.get({ id: contract.id });

	assert.equal((await api.payment.getMany({ contractId: contract.id })).length, 2);
	assert.equal(after?.paidAmount, 0);
	assert.equal(after?.status, 'terminated');
});

test('on a restored contract undoing a bulk deletion puts back a refund past its live limit', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 100000 });

	await seedPayment(api, contract.id, 5000);
	await api.contract.terminate({ id: contract.id });

	const returned = await seedRefund(api, contract.id, 3000);

	await api.contract.unterminate({ id: contract.id });

	const deleted = await api.payment.deleteMany({ ids: [returned.id] });

	assert.deepEqual(toIds(deleted.deleted), [returned.id]);

	// by hand, nothing more may be returned on the live contract.
	await assert.rejects(
		() => seedRefund(api, contract.id, 3000),
		refusedWith('contract.refundAboveLimit', { limit: 0 })
	);

	const restored = await api.payment.createMany({ payments: deleted.deleted });

	assert.deepEqual(toIds(restored), [returned.id]);
	assert.equal(restored[0]?.amount, 3000);
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 2000);
});

test('a bulk undo putting payments received and refunds back weighs the refunds against them', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 12000 });
	const received = await seedPayment(api, contract.id, 13000);
	const returned = await seedRefund(api, contract.id, 1000);
	const deleted = await api.payment.deleteMany({ ids: [received.id, returned.id] });

	assert.deepEqual(toIds(deleted.deleted), [received.id, returned.id]);

	const restored = await api.payment.createMany({ payments: deleted.deleted });

	assert.deepEqual(toIds(restored), [received.id, returned.id]);
	assert.equal((await api.contract.get({ id: contract.id }))?.paidAmount, 12000);
});
