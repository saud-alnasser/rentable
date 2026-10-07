import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	monthsFromNow,
	unusedId,
	withStatementLog,
	refusedWith,
	refusalReadIn
} from '$lib/app/tests/testing.ts';
import { seedComplexWithUnit, seedContract } from '$lib/contract/tests/seed.ts';

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

	await api.payment.create({
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

// the criterion this ticket exists for on the read side: the confirmation asks the workspace what
// a deletion is refused for instead of reading the list. The units a contract holds go with it
// (ticket 38), so only its payments refuse it.
test('a plan answers for a rule no row on the list carries', async () => {
	const api = await createApi();
	const holdingUnits = await seedContractHoldingAUnit(api, 'S1');
	const carryingPayments = await seedContractCarryingAPayment(api);
	const free = await seedContract(api);

	const plan = await api.contract.planMany({
		ids: [holdingUnits.id, carryingPayments.id, free.id],
		action: 'delete'
	});

	assert.deepEqual(plan.eligible, [holdingUnits.id, free.id]);
	assert.deepEqual(
		plan.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: carryingPayments.id, reason: 'holds-payments' }]
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
	const carryingPayments = await seedContractCarryingAPayment(api);

	const result = await api.contract.deleteMany({
		ids: [first.id, second.id, carryingPayments.id]
	});

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(
		result.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: carryingPayments.id, reason: 'holds-payments' }]
	);
	assert.equal(await api.contract.get({ id: first.id }), undefined);
	assert.ok(await api.contract.get({ id: carryingPayments.id }));
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

// effort 854, requirement 4: a contract whose unit another live contract took since it was
// terminated is refused, by the plan and by the action alike, and the rest are restored.
test('restoring many refuses a contract whose unit was taken since, and restores the rest', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Many-Restore-Taken');
	const taken = await seedContract(api, { unitIds: [unit.id] });
	const free = await seedContract(api);

	await api.contract.terminateMany({ ids: [taken.id, free.id] });
	await seedContract(api, { unitIds: [unit.id] });

	const plan = await api.contract.planMany({ ids: [taken.id, free.id], action: 'restore' });

	assert.deepEqual(plan.eligible, [free.id]);
	assert.deepEqual(
		plan.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: taken.id, reason: 'units-taken' }]
	);

	const result = await api.contract.unterminateMany({ ids: [taken.id, free.id] });

	assert.deepEqual(toIds(result.unterminated), [free.id]);
	assert.deepEqual(
		result.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: taken.id, reason: 'units-taken' }]
	);
	assert.equal((await api.contract.get({ id: taken.id }))?.status, 'terminated');
	assert.notEqual((await api.contract.get({ id: free.id }))?.status, 'terminated');
});

// two terminated contracts on one unit over intersecting terms, selected together: restoring
// both would double-book the unit, so the first named is restored and the second refused.
test('restoring two terminated contracts on one unit restores one and refuses the other', async () => {
	const api = await createApi();
	const { unit } = await seedComplexWithUnit(api, 'Many-Restore-Pair');
	const first = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: first.id });

	const second = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.terminate({ id: second.id });

	const plan = await api.contract.planMany({ ids: [first.id, second.id], action: 'restore' });

	assert.deepEqual(plan.eligible, [first.id]);
	assert.deepEqual(
		plan.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: second.id, reason: 'units-taken' }]
	);

	const result = await api.contract.unterminateMany({ ids: [first.id, second.id] });

	assert.deepEqual(toIds(result.unterminated), [first.id]);
	assert.deepEqual(
		result.refused.map((refusal) => ({ id: refusal.id, reason: refusal.reason })),
		[{ id: second.id, reason: 'units-taken' }]
	);
	assert.equal((await api.contract.get({ id: second.id }))?.status, 'terminated');
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

// ticket 38: a selection deletes its contracts with their units in one batch, and putting it back
// restores each holding what it held.
test('a deleted selection takes its units with it, and is put back holding them', async () => {
	const api = await createApi();
	const holding = await seedContractHoldingAUnit(api, 'Many-Units');
	const free = await seedContract(api);
	const [unit] = await api.contract.units.getMany({ contractId: holding.id });

	const deleted = await api.contract.deleteMany({ ids: [holding.id, free.id] });

	assert.deepEqual(toIds(deleted.deleted).sort(), [holding.id, free.id].sort());
	assert.deepEqual(deleted.refused, []);
	assert.equal((await api.complex.units.get({ id: unit.id }))?.status, 'vacant');

	await api.contract.restoreMany({ contracts: deleted.deleted });

	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: holding.id })).map((held) => held.id),
		[unit.id]
	);
	assert.deepEqual(await api.contract.units.getMany({ contractId: free.id }), []);
	assert.equal((await api.complex.units.get({ id: unit.id }))?.status, 'occupied');
});

// ticket 41: a selection is put back as it was, not created again. A terminated contract in it
// comes back terminated, and a unit another contract took since the deletion is held by both
// rather than refusing the undo.
test('a deleted selection is put back as it was, even where one of its units was taken since', async () => {
	const api = await createApi();
	const holding = await seedContractHoldingAUnit(api, 'Many-Taken');
	const free = await seedContract(api);
	const [unit] = await api.contract.units.getMany({ contractId: holding.id });

	await api.contract.terminate({ id: holding.id });

	const deleted = await api.contract.deleteMany({ ids: [holding.id, free.id] });

	// another contract takes the released unit over the same term.
	const other = await seedContract(api, { unitIds: [unit.id] });

	await api.contract.restoreMany({ contracts: deleted.deleted });

	assert.equal((await api.contract.get({ id: holding.id }))?.status, 'terminated');
	assert.equal((await api.contract.get({ id: free.id }))?.status, free.status);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: holding.id })).map((held) => held.id),
		[unit.id]
	);
	assert.deepEqual(
		(await api.contract.units.getMany({ contractId: other.id })).map((held) => held.id),
		[unit.id]
	);
	assert.equal((await api.complex.units.get({ id: unit.id }))?.status, 'occupied');
});

test('a deleted selection is put back whole, each contract with the identity it had', async () => {
	const api = await createApi();
	const first = await seedContract(api, { govId: 'CT-BACK-1' });
	const second = await seedContract(api, { govId: 'CT-BACK-2' });

	const deleted = await api.contract.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.contract.restoreMany({ contracts: deleted.deleted });

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
		() => api.contract.restoreMany({ contracts: deleted.deleted }),
		refusedWith('contract.govIdTakenNamed', { named: 'CT-BLOCK-2' }),
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

	await assert.rejects(
		() => api.contract.restoreMany({ contracts: collided }),
		refusedWith('contract.repeatedInSet', { value: 'CT-TWICE' })
	);

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

		await api.contract.restoreMany({ contracts: deleted.deleted });
	});

	// three rows, and the reconcile that follows reads them once rather than three times.
	assert.equal(countMatching(statements, /^\s*insert into "contract"/i), 3);
	assert.ok(
		countMatching(statements, /select .* from "contract" where/i) <= 3,
		`one pass over the set, not one per row: ${statements.filter((sql) => /select .* from "contract" where/i.test(sql)).length}`
	);
});

// --- Refusals, as a reader of Arabic meets them ----------------------------------------
//
// effort 832, requirement 23: a refusal crosses as a code, and the interface words it in the
// reader's language.

test('a refusal naming a value keeps the value whole inside the Arabic sentence', async () => {
	const api = await createApi();
	const first = await seedContract(api, { govId: 'GOV-A' });
	const second = await seedContract(api, { govId: 'GOV-B' });

	const deleted = await api.contract.deleteMany({ ids: [first.id, second.id] });
	await seedContract(api, { govId: 'GOV-B' });

	// the id runs left to right whatever the sentence around it does, so it is isolated rather
	// than left for the bidirectional algorithm to reorder.
	assert.equal(
		await refusalReadIn(() => api.contract.restoreMany({ contracts: deleted.deleted })),
		'المعرف الحكومي \u2068GOV-B\u2069 مرتبط بعقد آخر.'
	);
});
