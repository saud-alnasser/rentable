import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	identityWithout,
	monthsFromNow,
	seedTenant,
	withStatementLog,
	refusedWith
} from '$lib/app/tests/testing.ts';
import { isRecordId, newId } from '$lib/platform/database/identity.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import type { ComplexSortColumnId } from '$lib/complex/complex.ts';
import type { ListSort } from '@rentable/design/sort.ts';

/** the sort a complexes list may be asked for, as the procedure states it. */
type ComplexSort = NonNullable<NonNullable<Parameters<Api['complex']['getMany']>[0]>['sort']>;

async function seedActiveContract(api: Api) {
	const tenant = await seedTenant(api);

	return api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});
}

// --- Complex -------------------------------------------------------------------------

test('creating a complex returns it with its fields', async () => {
	const api = await createApi();

	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	assert.equal(complex.name, 'Palm Court');
	assert.equal(complex.location, 'Riyadh');
	assert.ok(isRecordId(complex.id));
});

test('creating a complex with a duplicate name is rejected', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	await assert.rejects(
		() => api.complex.create({ name: 'Palm Court', location: 'Jeddah' }),
		refusedWith('complex.nameTaken')
	);
});

test('updating a complex changes its fields', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const updated = await api.complex.update({
		id: complex.id,
		name: 'Palm Gardens',
		location: 'Dammam'
	});

	assert.equal(updated.name, 'Palm Gardens');
	assert.equal(updated.location, 'Dammam');
});

test('a location-only update succeeds and leaves the name intact', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	// crashed on the unguarded name uniqueness check before #135.
	const updated = await api.complex.update({ id: complex.id, location: 'Dammam' });

	assert.equal(updated.name, 'Palm Court');
	assert.equal(updated.location, 'Dammam');
});

test('an id-only update is a no-op that returns the complex unchanged', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const updated = await api.complex.update({ id: complex.id });

	// creation answers with the units it made as well, so the row is compared rather than the
	// whole answer.
	const { units, ...row } = complex;

	assert.deepEqual(units, []);
	assert.deepEqual(updated, row);
});

test('a name-only update to a name used by another complex is still rejected', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const second = await api.complex.create({ name: 'Cedar Court', location: 'Jeddah' });

	await assert.rejects(
		() => api.complex.update({ id: second.id, name: 'Palm Court' }),
		refusedWith('complex.nameTaken')
	);
});

test('updating a complex to a name used by another complex is rejected', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	const second = await api.complex.create({ name: 'Cedar Court', location: 'Jeddah' });

	await assert.rejects(
		() => api.complex.update({ id: second.id, name: 'Palm Court', location: 'Jeddah' }),
		refusedWith('complex.nameTaken')
	);
});

test('deleting an empty complex removes it', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	await api.complex.delete({ id: complex.id });

	const found = await api.complex.get({ id: complex.id });
	assert.equal(found, undefined);
});

test('deleting a complex that still has units is rejected', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'A1', complexId: complex.id });

	await assert.rejects(
		() => api.complex.delete({ id: complex.id }),
		refusedWith('complex.holdsUnits')
	);
});

// --- The complexes directory ---------------------------------------------------------
//
// `getMany` answers the complexes list, which reads as a directory: the order is the
// reader's, and the unit and vacant counts are aggregates on the same query. Both are
// asserted here because both are what the list may not redo on the client.

async function seedOccupiedUnit(api: Api, complexId: string, name: string) {
	const unit = await api.complex.units.create({ name, complexId });
	const contract = await seedActiveContract(api);
	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	return unit;
}

test('a complex is listed with how many units it holds and how many stand vacant', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });
	await seedOccupiedUnit(api, complex.id, 'A1');
	await api.complex.units.create({ name: 'A2', complexId: complex.id });
	await api.complex.units.create({ name: 'A3', complexId: complex.id });

	const [listed] = await api.complex.getMany({});

	assert.equal(listed.unitCount, 3);
	assert.equal(listed.vacantUnitCount, 2);
});

test('a complex with no units is listed with counts of zero rather than omitted', async () => {
	const api = await createApi();
	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	const [listed] = await api.complex.getMany({});

	assert.equal(listed.id, complex.id);
	assert.equal(listed.unitCount, 0);
	assert.equal(listed.vacantUnitCount, 0);
});

test('the directory opens ordered by name', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Zahra Towers', location: 'Riyadh' });
	await api.complex.create({ name: 'Amber Court', location: 'Jeddah' });

	assert.deepEqual(
		(await api.complex.getMany({})).map((complex) => complex.name),
		['Amber Court', 'Zahra Towers']
	);
});

test('the directory orders by every key the sort control offers', async () => {
	const api = await createApi();
	const amber = await api.complex.create({ name: 'Amber Court', location: 'Riyadh' });
	const zahra = await api.complex.create({ name: 'Zahra Towers', location: 'Jeddah' });

	await api.complex.units.create({ name: 'A1', complexId: amber.id });
	await api.complex.units.create({ name: 'A2', complexId: amber.id });
	await seedOccupiedUnit(api, zahra.id, 'B1');

	const orderBy = async (columnId: ComplexSortColumnId, direction: ListSort['direction']) =>
		(await api.complex.getMany({ sort: { columnId, direction } })).map((complex) => complex.id);

	assert.deepEqual(await orderBy('name', 'asc'), [amber.id, zahra.id]);
	assert.deepEqual(await orderBy('name', 'desc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('location', 'asc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('location', 'desc'), [amber.id, zahra.id]);
	assert.deepEqual(await orderBy('unitCount', 'asc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('unitCount', 'desc'), [amber.id, zahra.id]);
	assert.deepEqual(await orderBy('vacantUnitCount', 'asc'), [zahra.id, amber.id]);
	assert.deepEqual(await orderBy('vacantUnitCount', 'desc'), [amber.id, zahra.id]);
});

test('complexes tied on the chosen order fall back to the directory order', async () => {
	const api = await createApi();
	// created Zahra first, so an id tie-break would put it first and a name one would not.
	const zahra = await api.complex.create({ name: 'Zahra Towers', location: 'Riyadh' });
	const amber = await api.complex.create({ name: 'Amber Court', location: 'Riyadh' });
	await api.complex.units.create({ name: 'B1', complexId: zahra.id });
	await api.complex.units.create({ name: 'A1', complexId: amber.id });

	assert.deepEqual(
		(await api.complex.getMany({ sort: { columnId: 'unitCount', direction: 'desc' } })).map(
			(complex) => complex.name
		),
		['Amber Court', 'Zahra Towers']
	);
});

test('the directory refuses to order by a column the control does not offer', async () => {
	const api = await createApi();

	// `id` is outside the sort vocabulary, so it cannot be named in the caller's own type —
	// the vocabulary *is* the type. It arrives here the way a reader's chosen column really
	// does, as the plain string of a `ListSort`, with the vocabulary guard the query layer
	// applies skipped: what is asserted is that the procedure refuses it on its own.
	const chosen: ListSort = { columnId: 'id', direction: 'asc' };

	await assert.rejects(() => api.complex.getMany({ sort: chosen as ComplexSort }));
});

test('searching the directory narrows it by name and by location', async () => {
	const api = await createApi();
	const amber = await api.complex.create({ name: 'Amber Court', location: 'Riyadh' });
	const zahra = await api.complex.create({ name: 'Zahra Towers', location: 'Riyadh' });
	await api.complex.create({ name: 'Coral Bay', location: 'Jeddah' });
	await api.complex.units.create({ name: 'B1', complexId: zahra.id });

	const byLocation = await api.complex.getMany({
		search: 'Riyadh',
		sort: { columnId: 'unitCount', direction: 'desc' }
	});

	assert.deepEqual(
		byLocation.map((complex) => complex.id),
		[zahra.id, amber.id]
	);
	assert.deepEqual(
		(await api.complex.getMany({ search: 'Coral' })).map((complex) => complex.name),
		['Coral Bay']
	);
});

// --- Creating a complex with its units ------------------------------------------------

test('a complex and its units are created in one submission', async () => {
	const api = await createApi();

	const complex = await api.complex.create({
		name: 'Palm Court',
		location: 'Riyadh',
		units: [{ name: 'A1' }, { name: 'A2' }]
	});

	assert.deepEqual(
		(await api.complex.units.getMany({ complexId: complex.id })).map((unit) => unit.name),
		['A1', 'A2']
	);
});

test('a complex can still be created with no units', async () => {
	const api = await createApi();

	const complex = await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	assert.deepEqual(await api.complex.units.getMany({ complexId: complex.id }), []);
});

// a collision one dialog at a time could not produce: each unit was checked against what was
// stored, and there was never a set to check against itself.
test('two units entered under one name are refused, naming the collision', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.complex.create({
				name: 'Palm Court',
				location: 'Riyadh',
				units: [{ name: 'A1' }, { name: ' a1 ' }]
			}),
		refusedWith('unit.nameRepeated', { name: 'a1' })
	);

	assert.deepEqual(await api.complex.getMany({}), []);
});

test('a refused complex name creates none of its units either', async () => {
	const api = await createApi();
	await api.complex.create({ name: 'Palm Court', location: 'Riyadh' });

	await assert.rejects(
		() =>
			api.complex.create({
				name: 'Palm Court',
				location: 'Jeddah',
				units: [{ name: 'A1' }]
			}),
		refusedWith('complex.nameTaken')
	);

	assert.deepEqual(
		(await api.complex.getMany({})).map((complex) => complex.location),
		['Riyadh']
	);
	assert.equal((await api.complex.getMany({}))[0].unitCount, 0);
});

// --- What a selection would do -------------------------------------------------------
//
// The plan and the deletion go through one call, so they cannot answer differently about
// what a refusal is. What they can differ about is the workspace, because another device
// may write between the reader being shown a plan and reaching for the control, and the
// deletion is what is authoritative about that.

/** the identities out of what a multi-record action reported it changed. */
const toIds = (records: readonly { id: string }[]) => records.map((record) => record.id);

let complexSequence = 0;

/** A complex under a name nothing else in the test holds, since the name is unique workspace-wide. */
async function seedComplex(api: Api) {
	complexSequence += 1;

	return api.complex.create({ name: `Complex ${complexSequence}`, location: 'Riyadh' });
}

async function seedComplexHoldingAUnit(api: Api) {
	const complex = await seedComplex(api);

	await api.complex.units.create({ name: 'A1', complexId: complex.id });

	return complex;
}

test('a plan says which complexes in a selection would go through and which would not', async () => {
	const api = await createApi();
	const empty = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);
	const gone = newId();

	const plan = await api.complex.planMany({ ids: [empty.id, held.id, gone] });

	assert.deepEqual(plan.eligible, [empty.id]);
	assert.deepEqual(plan.refused, [
		{ id: held.id, name: held.name, reason: 'holds-units' },
		// nothing survived to name it by, so the count against the reason is what carries it.
		{ id: gone, name: '', reason: 'missing' }
	]);
});

test('asking what a deletion would do writes nothing', async () => {
	const api = await createApi();
	const empty = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);

	await api.complex.planMany({ ids: [empty.id, held.id] });
	await api.complex.units.planMany({
		ids: (await api.complex.units.getMany({ complexId: held.id })).map((unit) => unit.id)
	});

	assert.ok(await api.complex.get({ id: empty.id }));
	assert.ok(await api.complex.get({ id: held.id }));
	assert.equal((await api.complex.units.getMany({ complexId: held.id })).length, 1);
});

// the claim the whole confirmation rests on: what the reader is shown is what the deletion
// then decides, because both are the same call over the same workspace.
test('a plan and the deletion it precedes refuse exactly the same complexes', async () => {
	const api = await createApi();
	const empty = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);
	const gone = newId();
	const ids = [empty.id, held.id, gone];

	const plan = await api.complex.planMany({ ids });
	const result = await api.complex.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [...plan.eligible]);
	assert.deepEqual(result.refused, plan.refused);
	// and every complex named is accounted for on one side or the other: a set that reported
	// neither a deletion nor a refusal for one of them would pass the two lines above.
	assert.deepEqual(
		[...toIds(result.deleted), ...result.refused.map((refusal) => refusal.id)].sort(),
		[...ids].sort()
	);
});

// the plan is what the reader agreed to, and the deletion is what happened. Where the
// workspace moved in between, the second is the answer.
test('what the deletion refuses is what happened, not what the plan showed', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);
	const ids = [first.id, second.id];

	const plan = await api.complex.planMany({ ids });
	assert.deepEqual([...plan.eligible].sort(), [...ids].sort());

	// somebody else puts a unit in the second complex while the confirmation is open.
	await api.complex.units.create({ name: 'A1', complexId: second.id });

	const result = await api.complex.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [first.id]);
	assert.deepEqual(result.refused, [{ id: second.id, name: second.name, reason: 'holds-units' }]);
});

test('several complexes are deleted by one action, and the rest are named', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);
	const held = await seedComplexHoldingAUnit(api);

	const result = await api.complex.deleteMany({ ids: [first.id, second.id, held.id] });

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(result.refused, [{ id: held.id, name: held.name, reason: 'holds-units' }]);

	for (const id of [first.id, second.id]) {
		assert.equal(await api.complex.get({ id }), undefined);
	}

	assert.ok(await api.complex.get({ id: held.id }), 'the refused complex is still there');
});

// about cost rather than outcome: a selection is one thing the reader asked for, and issuing
// it as N calls costs a round trip per record for work one statement does. A complex carries
// nothing derived, so there is no reconcile pass here to count.
test('deleting many complexes issues one delete rather than one per record', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedComplex(api)).id);
		}

		drain();

		await api.complex.deleteMany({ ids });
	});

	assert.equal(countMatching(statements, /^\s*delete from "complex"/i), 1);
});

// --- Putting a deleted selection back ------------------------------------------------

test('a deleted selection of complexes is put back whole, each with the identity it had', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);

	const deleted = await api.complex.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.complex.createMany({ complexes: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await api.complex.get({ id: original.id });

		assert.ok(back, 'the complex is there under the identity it had');
		assert.equal(back.name, original.name);
		assert.equal(back.location, original.location);
	}
});

// all or nothing, and the reason: a set half restored is a workspace in a shape neither the
// deletion nor the undo describes. The reader is told which one blocked it, by name.
test('and where one complex cannot be put back, none is', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);

	const deleted = await api.complex.deleteMany({ ids: [first.id, second.id] });

	// somebody registers a complex under a name one of them held while the deletion sits on the
	// undo stack.
	await api.complex.create({ name: second.name, location: 'Jeddah' });

	await assert.rejects(
		() => api.complex.createMany({ complexes: deleted.deleted }),
		refusedWith('complex.nameTakenNamed', { named: second.name })
	);

	assert.equal(await api.complex.get({ id: first.id }), undefined);
});

test('and a set of complexes claiming one name twice is refused before anything is written', async () => {
	const api = await createApi();
	const first = await seedComplex(api);
	const second = await seedComplex(api);

	const deleted = await api.complex.deleteMany({ ids: [first.id, second.id] });
	const [head, tail] = deleted.deleted;

	await assert.rejects(
		() => api.complex.createMany({ complexes: [head, { ...tail, name: head.name }] }),
		refusedWith('complex.repeatedInSet', { value: head.name })
	);

	assert.equal(await api.complex.get({ id: head.id }), undefined);
});

// --- Palette search -------------------------------------------------------------------

test('a complex is found by name or location, and a unit by either its own name or its complex', async () => {
	const api = await createApi();
	const complex = await api.complex.create({
		name: 'Palm Court',
		location: 'Riyadh',
		units: [{ name: 'A1' }]
	});
	const [unit] = await api.complex.units.getMany({ complexId: complex.id });

	assert.deepEqual(
		(await api.complex.search({ term: 'Riyadh' })).map((match) => match.id),
		[complex.id]
	);
	assert.deepEqual(
		(await api.complex.units.search({ term: 'Palm' })).map((match) => match.id),
		[unit.id]
	);
	assert.equal((await api.complex.units.search({ term: 'A1' }))[0].hint, 'Palm Court');
});

// --- What a member may not view ------------------------------------------------------------
//
// Effort 838, requirement 10: a complex's and a unit's reads leave out every field of a kind the
// member may not view. The same workspace is read by a member holding every record act and by one
// lacking a single view flag.

test('without viewing units, a complex row counts no units and is not ordered by them', async () => {
	const db = createMemoryDatabase();
	const api = await createApi({ db });
	const full = await api.complex.create({ name: 'Complex B', location: 'Riyadh' });
	const empty = await api.complex.create({ name: 'Complex A', location: 'Riyadh' });

	await api.complex.units.create({ name: 'Unit 1', complexId: full.id });

	const [everything] = await api.complex.getMany({
		sort: { columnId: 'unitCount', direction: 'desc' }
	});
	const rows = await (
		await createApi({ db, identity: identityWithout('viewUnit') })
	).complex.getMany({ sort: { columnId: 'unitCount', direction: 'desc' } });

	assert.equal(everything?.unitCount, 1);
	assert.deepEqual(
		rows.map((complex) => complex.id),
		[empty.id, full.id]
	);

	for (const row of rows) {
		assert.equal('unitCount' in row, false);
		assert.equal('vacantUnitCount' in row, false);
	}
});
